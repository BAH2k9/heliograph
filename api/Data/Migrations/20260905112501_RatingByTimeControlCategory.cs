using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <summary>
    /// Splits the single global <c>Rating</c>/<c>RatedGamesPlayed</c> pair into 4 explicit
    /// per-<c>TimeControlCategory</c> column pairs (additive columns, not a normalized table — see
    /// <c>CLAUDE.md</c> and the <c>AddTimeControls</c> migration's own reasoning). The data copy is
    /// a one-time historical approximation: every existing account's old single value is flat-copied
    /// into all four new buckets (not reset to 1200, not a replay of per-category game history —
    /// that's explicitly out of scope for this plan).
    /// </summary>
    /// <inheritdoc />
    public partial class RatingByTimeControlCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BulletRating",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 1200);

            migrationBuilder.AddColumn<int>(
                name: "BulletGamesPlayed",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "BlitzRating",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 1200);

            migrationBuilder.AddColumn<int>(
                name: "BlitzGamesPlayed",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "RapidRating",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 1200);

            migrationBuilder.AddColumn<int>(
                name: "RapidGamesPlayed",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DailyRating",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 1200);

            migrationBuilder.AddColumn<int>(
                name: "DailyGamesPlayed",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Backfill: copy every existing account's single old Rating/RatedGamesPlayed value into
            // all four new buckets. A flat historical approximation, not a replay of game history.
            migrationBuilder.Sql(
                """
                UPDATE "AspNetUsers"
                SET "BulletRating" = "Rating", "BulletGamesPlayed" = "RatedGamesPlayed",
                    "BlitzRating"  = "Rating", "BlitzGamesPlayed"  = "RatedGamesPlayed",
                    "RapidRating"  = "Rating", "RapidGamesPlayed"  = "RatedGamesPlayed",
                    "DailyRating"  = "Rating", "DailyGamesPlayed"  = "RatedGamesPlayed";
                """);

            migrationBuilder.DropColumn(
                name: "Rating",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "RatedGamesPlayed",
                table: "AspNetUsers");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Rating",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 1200);

            migrationBuilder.AddColumn<int>(
                name: "RatedGamesPlayed",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Best-effort reverse: restore the single value from the Rapid bucket (an arbitrary but
            // stable pick — the four buckets have diverged by now, so no reverse copy is lossless).
            migrationBuilder.Sql(
                """
                UPDATE "AspNetUsers"
                SET "Rating" = "RapidRating", "RatedGamesPlayed" = "RapidGamesPlayed";
                """);

            migrationBuilder.DropColumn(
                name: "BulletRating",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BulletGamesPlayed",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BlitzRating",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BlitzGamesPlayed",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "RapidRating",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "RapidGamesPlayed",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DailyRating",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DailyGamesPlayed",
                table: "AspNetUsers");
        }
    }
}
