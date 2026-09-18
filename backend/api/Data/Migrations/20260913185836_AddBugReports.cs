using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBugReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BugReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Seat = table.Column<string>(type: "text", nullable: true),
                    ConnectionId = table.Column<string>(type: "text", nullable: true),
                    MoveCount = table.Column<int>(type: "integer", nullable: false),
                    Turn = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: true),
                    ServerOffsetMs = table.Column<long>(type: "bigint", nullable: true),
                    LastTraceId = table.Column<string>(type: "text", nullable: true),
                    ClientCapturedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    BundleJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BugReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BugReports_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_BugReports_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BugReports_GameId",
                table: "BugReports",
                column: "GameId");

            migrationBuilder.CreateIndex(
                name: "IX_BugReports_ReceivedAtUtc",
                table: "BugReports",
                column: "ReceivedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_BugReports_UserId",
                table: "BugReports",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BugReports");
        }
    }
}
