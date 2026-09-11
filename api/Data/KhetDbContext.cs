using Khet.Api.Domain;
using Khet.Api.Persistence;
using Khet.Contracts;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Data;

/// <summary>
/// Owns every EF migration for this project — Identity's tables (<c>AspNetUsers</c> etc.) live in
/// the same Postgres DB as <see cref="Games"/>/<see cref="Moves"/>, not a second DbContext.
/// <see cref="IdentityUserContext{TUser,TKey}"/> (not the full <c>IdentityDbContext</c>) because
/// there's no role concept here — see <c>Program.cs</c>'s <c>AddIdentityCore</c> registration.
/// </summary>
public class KhetDbContext(DbContextOptions<KhetDbContext> options)
    : IdentityUserContext<ApplicationUser, Guid>(options)
{
    public DbSet<Game> Games => Set<Game>();

    public DbSet<Move> Moves => Set<Move>();

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<Friendship> Friendships => Set<Friendship>();

    public DbSet<MatchInvite> MatchInvites => Set<MatchInvite>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Load-bearing on IdentityUserContext — without it Identity's own table mappings
        // (AspNetUsers, AspNetUserClaims, AspNetUserLogins, AspNetUserTokens) never apply.
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(u => u.DisplayName).HasMaxLength(32);
            entity.Property(u => u.Discriminator).HasMaxLength(4).IsFixedLength();

            // Not globally unique — only the pair is. Two accounts named "Bob" can't both be
            // "Bob#0007", but "Bob#0007" and "Alice#0007" coexist fine (see Discriminator's doc
            // comment). AuthService/AuthControllerHelpers retries on this collision the same shape
            // RoomService.NewCode() retries a join-code collision.
            entity.HasIndex(u => new { u.DisplayName, u.Discriminator }).IsUnique();
        });

        modelBuilder.Entity<Friendship>(entity =>
        {
            entity.HasKey(f => f.Id);
            entity.Property(f => f.Status).HasConversion<string>().HasMaxLength(8);

            // Guards a duplicate request in the *same* direction; a pending row in the reverse
            // direction is a separate index entry, so FriendService checks for it explicitly and
            // treats it as an implicit accept (see Friendship's doc comment).
            entity.HasIndex(f => new { f.RequesterId, f.AddresseeId }).IsUnique();

            // Cascade, not SetNull like Game.P1UserId/P2UserId: a friendship carries no useful
            // history once either account is gone (unlike a finished game), so it should simply
            // disappear with the account rather than orphan into an unfriendable ghost row.
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(f => f.RequesterId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(f => f.AddresseeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MatchInvite>(entity =>
        {
            entity.HasKey(i => i.Id);
            entity.Property(i => i.Status).HasConversion<string>().HasMaxLength(8);
            entity.Property(i => i.Ruleset).HasMaxLength(16);
            entity.Property(i => i.Layout).HasMaxLength(16);
            entity.Property(i => i.TimeControl).HasMaxLength(16);

            // Serves both "pending invites for this invitee" (GET /api/invites/pending) and the
            // AcceptAsync/DeclineAsync lookup by id, which also filters on Status/InviteeId.
            entity.HasIndex(i => new { i.InviteeId, i.Status });

            // Cascade, like Friendship: an invite carries no useful history once either account is
            // gone, so it should disappear with the account rather than orphan into an unactionable
            // ghost row (contrast with Game.P1UserId/P2UserId's SetNull, which does need to survive).
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(i => i.InviterId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(i => i.InviteeId)
                .OnDelete(DeleteBehavior.Cascade);

            // SetNull, not Cascade: once accepted, the resulting Game is a real game and must
            // survive the invite row (and, transitively, must not be deleted if the invite row
            // itself is ever pruned later) — same reasoning as Game.P1UserId/P2UserId.
            entity.HasOne<Game>()
                .WithMany()
                .HasForeignKey(i => i.GameId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.TokenHash).HasMaxLength(88); // base64(SHA-256) is 44 chars; headroom for encoding variance
            entity.HasIndex(t => t.TokenHash).IsUnique();
            entity.HasOne(t => t.User)
                .WithMany()
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Game>(entity =>
        {
            entity.HasKey(g => g.Id);
            entity.Property(g => g.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(g => g.CurrentTurn).HasConversion<string>().HasMaxLength(2);
            entity.Property(g => g.JoinCode).HasMaxLength(12);

            // Server-side default so the AddRulesetAndLayout migration is safe against the
            // existing Games rows (production auto-migrates on boot).
            entity.Property(g => g.Ruleset).HasMaxLength(16).HasDefaultValue("Classic");
            entity.Property(g => g.Layout).HasMaxLength(16).HasDefaultValue("Classic");

            // Nullable, no default — unlike Ruleset/Layout above, null carries meaning here
            // (untimed game) rather than needing a safe non-null fallback for existing rows.
            entity.Property(g => g.TimeControl).HasMaxLength(16);
            entity.Property(g => g.EndReason).HasMaxLength(16);

            entity.HasIndex(g => g.JoinCode)
                .IsUnique()
                .HasFilter("\"JoinCode\" IS NOT NULL");

            entity.Property(g => g.State)
                .HasColumnType("jsonb")
                .HasConversion(new JsonbConverter<BoardState>())
                .Metadata.SetValueComparer(new JsonbComparer<BoardState>());

            entity.HasMany(g => g.Moves)
                .WithOne(m => m.Game)
                .HasForeignKey(m => m.GameId)
                .OnDelete(DeleteBehavior.Cascade);

            // SetNull, not Cascade — deleting an account should orphan its seat on old games
            // (they stay in Postgres, just anonymized), never delete the games themselves.
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(g => g.P1UserId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(g => g.P2UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Move>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Player).HasConversion<string>().HasMaxLength(2);
            entity.Property(m => m.Type).HasConversion<string>().HasMaxLength(8);
            entity.Property(m => m.RotationDir).HasConversion<string>().HasMaxLength(4);

            entity.Property(m => m.LaserResult)
                .HasColumnType("jsonb")
                .HasConversion(new JsonbConverter<LaserResult>())
                .Metadata.SetValueComparer(new JsonbComparer<LaserResult>());

            // Append-only history + guards against a double-submitted move. Also serves GameId lookups (prefix).
            entity.HasIndex(m => new { m.GameId, m.MoveNumber }).IsUnique();
        });
    }
}
