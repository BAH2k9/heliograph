namespace Khet.Api.Domain;

/// <summary>
/// A friend request/relationship between two accounts. <see cref="Pending"/> means
/// <see cref="Friendship.RequesterId"/> asked and <see cref="Friendship.AddresseeId"/> hasn't
/// answered yet; <see cref="Accepted"/> means both sides are friends. A declined request is just
/// deleted, not stored as a third status — nothing ever reads a "declined" history (see plan
/// <c>06-friend-invites-friendships.md</c>'s "null carries meaning" framing: don't model a state
/// nothing consumes).
/// </summary>
public enum FriendshipStatus
{
    Pending,
    Accepted,
}

/// <summary>
/// One row per friend request/relationship, keyed directionally by <see cref="RequesterId"/> →
/// <see cref="AddresseeId"/> even once <see cref="Status"/> is <see cref="FriendshipStatus.Accepted"/>
/// (the direction just records who originally asked). <see cref="FriendService"/> owns every
/// mutation — see its own doc comment for the "reverse-pending is an implicit accept" rule the
/// unique index on <c>(RequesterId, AddresseeId)</c> alone can't enforce (a pending row in the
/// *other* direction is a separate index entry, so the service layer has to check for it explicitly
/// before insert).
/// </summary>
public class Friendship
{
    public Guid Id { get; set; }

    public Guid RequesterId { get; set; }

    public Guid AddresseeId { get; set; }

    public FriendshipStatus Status { get; set; }

    public DateTime CreatedAtUtc { get; set; }
}
