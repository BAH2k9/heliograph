using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRematchToGames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "P1RematchRequestedAtUtc",
                table: "Games",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "P2RematchRequestedAtUtc",
                table: "Games",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RematchGameId",
                table: "Games",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "P1RematchRequestedAtUtc",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "P2RematchRequestedAtUtc",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "RematchGameId",
                table: "Games");
        }
    }
}
