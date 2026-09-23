using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Heliograph.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMatchInvites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MatchInvites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InviterId = table.Column<Guid>(type: "uuid", nullable: false),
                    InviteeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ruleset = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Layout = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    TimeControl = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    Rated = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MatchInvites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MatchInvites_AspNetUsers_InviteeId",
                        column: x => x.InviteeId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MatchInvites_AspNetUsers_InviterId",
                        column: x => x.InviterId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MatchInvites_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MatchInvites_GameId",
                table: "MatchInvites",
                column: "GameId");

            migrationBuilder.CreateIndex(
                name: "IX_MatchInvites_InviteeId_Status",
                table: "MatchInvites",
                columns: new[] { "InviteeId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MatchInvites_InviterId",
                table: "MatchInvites",
                column: "InviterId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MatchInvites");
        }
    }
}
