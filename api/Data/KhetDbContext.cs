using Khet.Api.Contracts;
using Khet.Api.Domain;
using Khet.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Data;

public class KhetDbContext(DbContextOptions<KhetDbContext> options) : DbContext(options)
{
    public DbSet<Game> Games => Set<Game>();

    public DbSet<Move> Moves => Set<Move>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Game>(entity =>
        {
            entity.HasKey(g => g.Id);
            entity.Property(g => g.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(g => g.CurrentTurn).HasConversion<string>().HasMaxLength(2);
            entity.Property(g => g.JoinCode).HasMaxLength(12);
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
