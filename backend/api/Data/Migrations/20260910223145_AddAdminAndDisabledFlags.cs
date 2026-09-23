using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Heliograph.Api.Data.Migrations
{
    /// <summary>
    /// Adds the three <c>ApplicationUser</c> columns the <c>/api/admin</c> surface needs:
    /// <c>IsAdmin</c> / <c>IsDisabled</c> (both default false — the first admin is bootstrapped from
    /// <c>AdminOptions.BootstrapEmail</c> at startup, not here, so no personal email lands in git),
    /// and <c>CreatedAtUtc</c> (the admin user list's default sort). Production auto-migrates on
    /// boot, so <c>CreatedAtUtc</c> backfills existing rows with <c>now()</c> rather than a nullable
    /// column or a year-0001 sentinel — an approximation, like the <c>RatingByTimeControlCategory</c>
    /// backfill, not a reconstruction of real registration times.
    /// </summary>
    /// <inheritdoc />
    public partial class AddAdminAndDisabledFlags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAtUtc",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<bool>(
                name: "IsAdmin",
                table: "AspNetUsers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsDisabled",
                table: "AspNetUsers",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedAtUtc",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "IsAdmin",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "IsDisabled",
                table: "AspNetUsers");
        }
    }
}
