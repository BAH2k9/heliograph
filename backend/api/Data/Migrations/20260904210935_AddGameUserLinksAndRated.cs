using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Heliograph.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGameUserLinksAndRated : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "P1UserId",
                table: "Games",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "P2UserId",
                table: "Games",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Rated",
                table: "Games",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Games_P1UserId",
                table: "Games",
                column: "P1UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Games_P2UserId",
                table: "Games",
                column: "P2UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Games_AspNetUsers_P1UserId",
                table: "Games",
                column: "P1UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Games_AspNetUsers_P2UserId",
                table: "Games",
                column: "P2UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Games_AspNetUsers_P1UserId",
                table: "Games");

            migrationBuilder.DropForeignKey(
                name: "FK_Games_AspNetUsers_P2UserId",
                table: "Games");

            migrationBuilder.DropIndex(
                name: "IX_Games_P1UserId",
                table: "Games");

            migrationBuilder.DropIndex(
                name: "IX_Games_P2UserId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "P1UserId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "P2UserId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "Rated",
                table: "Games");
        }
    }
}
