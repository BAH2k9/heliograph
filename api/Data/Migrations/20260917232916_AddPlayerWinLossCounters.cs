using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerWinLossCounters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BlitzLosses",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "BlitzWins",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "BulletLosses",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "BulletWins",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DailyLosses",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DailyWins",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "RapidLosses",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "RapidWins",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "UntimedLosses",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "UntimedWins",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BlitzLosses",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BlitzWins",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BulletLosses",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BulletWins",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DailyLosses",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DailyWins",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "RapidLosses",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "RapidWins",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "UntimedLosses",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "UntimedWins",
                table: "AspNetUsers");
        }
    }
}
