using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTimeControls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EndReason",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "P1RemainingMs",
                table: "Games",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "P2RemainingMs",
                table: "Games",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimeControl",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TurnDeadlineUtc",
                table: "Games",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TurnStartedAtUtc",
                table: "Games",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EndReason",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "P1RemainingMs",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "P2RemainingMs",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "TimeControl",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "TurnDeadlineUtc",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "TurnStartedAtUtc",
                table: "Games");
        }
    }
}
