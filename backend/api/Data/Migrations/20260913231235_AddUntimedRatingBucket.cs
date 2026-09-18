using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <summary>
    /// Adds a fifth <c>TimeControlCategory.Untimed</c> rating bucket, same additive-column shape as
    /// the four added by <c>RatingByTimeControlCategory</c> — a rated untimed game now moves this
    /// bucket instead of being a no-op (owner decision; see <c>GameEndService.ApplyEloAsync</c>).
    /// <c>defaultValue: 1200</c> on <c>UntimedRating</c> matches every account's existing buckets
    /// and <c>ApplicationUser.UntimedRating</c>'s own C# initializer — an untouched bucket must never
    /// read as 0.
    /// </summary>
    /// <inheritdoc />
    public partial class AddUntimedRatingBucket : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "UntimedGamesPlayed",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "UntimedRating",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 1200);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UntimedGamesPlayed",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "UntimedRating",
                table: "AspNetUsers");
        }
    }
}
