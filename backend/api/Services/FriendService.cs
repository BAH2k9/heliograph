using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Heliograph.Api.Services;

/// <summary>
/// User search + the friend request/accept/decline/unfriend/list surface. Registered
/// <c>AddScoped</c> (mutates tracked <see cref="Friendship"/>/<see cref="ApplicationUser"/> rows on
/// the request <see cref="HeliographDbContext"/>, same reasoning as <see cref="RoomService"/>).
///
/// <see cref="RequestAsync"/> is the one method with a real business rule beyond CRUD: a pending
/// request in *either* direction between the same two users counts as "already exists" — the unique
/// index on <c>(RequesterId, AddresseeId)</c> only guards the same direction, so a pending row the
/// *other* way is a separate index entry the service has to check for explicitly. When it finds one,
/// this call accepts that reverse request instead of creating a second row (same UX as most
/// friend-request systems: B asking A while A→B is already pending just completes the friendship).
/// </summary>
public sealed class FriendService(HeliographDbContext db, TimeProvider time)
{
    private const int MaxSearchResults = 20;

    private DateTime Now() => time.GetUtcNow().UtcDateTime;

    /// <summary>Up to 20 hits, excluding the caller, case-insensitive contains on <see cref="ApplicationUser.DisplayName"/>.</summary>
    public async Task<IReadOnlyList<UserSearchResult>> SearchUsersAsync(Guid callerId, string query, CancellationToken ct = default)
    {
        var term = $"%{query}%";
        var users = await db.Users.AsNoTracking()
            .Where(u => u.Id != callerId && EF.Functions.ILike(u.DisplayName, term))
            .OrderBy(u => u.DisplayName)
            .ThenBy(u => u.Discriminator)
            .Take(MaxSearchResults)
            .ToListAsync(ct);

        return users.Select(u => new UserSearchResult(u.Id, u.DisplayName, u.Discriminator, u.AvatarId)).ToList();
    }

    /// <summary>
    /// Throws <see cref="UnknownUserException"/> (→ 400) if <paramref name="addresseeId"/> doesn't
    /// exist or equals <paramref name="callerId"/>; <see cref="AlreadyFriendsException"/> (→ 409) if
    /// already friends, or a request is already pending in the same direction. See this class's own
    /// doc comment for the implicit-accept case.
    /// </summary>
    public async Task<FriendRequestCreateResponse> RequestAsync(Guid callerId, Guid addresseeId, CancellationToken ct = default)
    {
        if (addresseeId == callerId)
            throw new UnknownUserException("cannot friend yourself");
        if (!await db.Users.AnyAsync(u => u.Id == addresseeId, ct))
            throw new UnknownUserException($"no user with id {addresseeId}");

        var existing = await db.Friendships
            .Where(f =>
                (f.RequesterId == callerId && f.AddresseeId == addresseeId) ||
                (f.RequesterId == addresseeId && f.AddresseeId == callerId))
            .ToListAsync(ct);

        if (existing.Any(f => f.Status == FriendshipStatus.Accepted))
            throw new AlreadyFriendsException("already friends");
        if (existing.Any(f => f.Status == FriendshipStatus.Pending && f.RequesterId == callerId))
            throw new AlreadyFriendsException("request already pending");

        var reversePending = existing.FirstOrDefault(f => f.Status == FriendshipStatus.Pending && f.RequesterId == addresseeId);
        if (reversePending is not null)
        {
            reversePending.Status = FriendshipStatus.Accepted;
            await db.SaveChangesAsync(ct);
            return new FriendRequestCreateResponse("accepted");
        }

        db.Friendships.Add(new Friendship
        {
            Id = Guid.NewGuid(),
            RequesterId = callerId,
            AddresseeId = addresseeId,
            Status = FriendshipStatus.Pending,
            CreatedAtUtc = Now(),
        });
        await db.SaveChangesAsync(ct);
        return new FriendRequestCreateResponse("pending");
    }

    /// <summary>
    /// Throws <see cref="FriendRequestNotFoundException"/> (→ 404) if no pending request with this
    /// id has <paramref name="callerId"/> as its addressee.
    /// </summary>
    public async Task<FriendSummary> AcceptAsync(Guid callerId, Guid requestId, CancellationToken ct = default)
    {
        var request = await PendingIncomingAsync(callerId, requestId, ct);
        request.Status = FriendshipStatus.Accepted;
        await db.SaveChangesAsync(ct);

        var requester = await db.Users.AsNoTracking().FirstAsync(u => u.Id == request.RequesterId, ct);
        return ToFriendSummary(requester);
    }

    /// <summary>Same auth shape as <see cref="AcceptAsync"/>; deletes the row instead of accepting it.</summary>
    public async Task DeclineAsync(Guid callerId, Guid requestId, CancellationToken ct = default)
    {
        var request = await PendingIncomingAsync(callerId, requestId, ct);
        db.Friendships.Remove(request);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Idempotent: removes an accepted friendship in either direction, a no-op if none existed.</summary>
    public async Task UnfriendAsync(Guid callerId, Guid friendUserId, CancellationToken ct = default)
    {
        var existing = await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted &&
                ((f.RequesterId == callerId && f.AddresseeId == friendUserId) ||
                 (f.RequesterId == friendUserId && f.AddresseeId == callerId)))
            .ToListAsync(ct);
        if (existing.Count == 0)
            return;

        db.Friendships.RemoveRange(existing);
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<FriendSummary>> ListFriendsAsync(Guid callerId, CancellationToken ct = default)
    {
        var friendIds = await db.Friendships.AsNoTracking()
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == callerId || f.AddresseeId == callerId))
            .Select(f => f.RequesterId == callerId ? f.AddresseeId : f.RequesterId)
            .ToListAsync(ct);

        var users = await db.Users.AsNoTracking().Where(u => friendIds.Contains(u.Id)).ToListAsync(ct);
        return users.Select(ToFriendSummary).ToList();
    }

    /// <summary>Pending requests where the caller is the addressee (someone asked them).</summary>
    public Task<IReadOnlyList<FriendRequestSummary>> ListIncomingAsync(Guid callerId, CancellationToken ct = default) =>
        ListRequestsAsync(callerId, incoming: true, ct);

    /// <summary>Pending requests where the caller is the requester (they asked someone).</summary>
    public Task<IReadOnlyList<FriendRequestSummary>> ListOutgoingAsync(Guid callerId, CancellationToken ct = default) =>
        ListRequestsAsync(callerId, incoming: false, ct);

    private async Task<Friendship> PendingIncomingAsync(Guid callerId, Guid requestId, CancellationToken ct)
    {
        var request = await db.Friendships.FirstOrDefaultAsync(
            f => f.Id == requestId && f.Status == FriendshipStatus.Pending && f.AddresseeId == callerId, ct);
        return request ?? throw new FriendRequestNotFoundException($"no pending request with id {requestId}");
    }

    private async Task<IReadOnlyList<FriendRequestSummary>> ListRequestsAsync(Guid callerId, bool incoming, CancellationToken ct)
    {
        var query = incoming
            ? db.Friendships.AsNoTracking().Where(f => f.Status == FriendshipStatus.Pending && f.AddresseeId == callerId)
            : db.Friendships.AsNoTracking().Where(f => f.Status == FriendshipStatus.Pending && f.RequesterId == callerId);

        var rows = await query
            .Select(f => new { f.Id, f.CreatedAtUtc, OtherId = incoming ? f.RequesterId : f.AddresseeId })
            .ToListAsync(ct);

        var otherIds = rows.Select(r => r.OtherId).ToList();
        var usersById = await db.Users.AsNoTracking()
            .Where(u => otherIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, ct);

        return rows
            .Select(r =>
            {
                var user = usersById[r.OtherId];
                return new FriendRequestSummary(r.Id, user.Id, user.DisplayName, user.Discriminator, user.AvatarId, r.CreatedAtUtc);
            })
            .ToList();
    }

    private static FriendSummary ToFriendSummary(ApplicationUser user) =>
        new(user.Id, user.DisplayName, user.Discriminator, user.AvatarId);
}
