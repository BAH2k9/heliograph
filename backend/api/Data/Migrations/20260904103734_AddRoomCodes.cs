using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Heliograph.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomCodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "JoinCode",
                table: "Games",
                type: "character varying(12)",
                maxLength: 12,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SeatsTaken",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Games_JoinCode",
                table: "Games",
                column: "JoinCode",
                unique: true,
                filter: "\"JoinCode\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Games_JoinCode",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "JoinCode",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "SeatsTaken",
                table: "Games");
        }
    }
}
