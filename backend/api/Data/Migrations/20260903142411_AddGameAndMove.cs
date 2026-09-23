using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Heliograph.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGameAndMove : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Games",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CurrentTurn = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    MoveCount = table.Column<int>(type: "integer", nullable: false),
                    RulesVersion = table.Column<int>(type: "integer", nullable: false),
                    State = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Games", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Moves",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    MoveNumber = table.Column<int>(type: "integer", nullable: false),
                    Player = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    Type = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    FromRow = table.Column<int>(type: "integer", nullable: false),
                    FromCol = table.Column<int>(type: "integer", nullable: false),
                    ToRow = table.Column<int>(type: "integer", nullable: true),
                    ToCol = table.Column<int>(type: "integer", nullable: true),
                    RotationDir = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    LaserResult = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Moves", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Moves_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Moves_GameId_MoveNumber",
                table: "Moves",
                columns: new[] { "GameId", "MoveNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Moves");

            migrationBuilder.DropTable(
                name: "Games");
        }
    }
}
