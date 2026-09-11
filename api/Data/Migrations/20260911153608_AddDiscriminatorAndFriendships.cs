using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <summary>
    /// Adds <c>ApplicationUser.Discriminator</c> plus the new <c>Friendships</c> table (plan
    /// <c>06-friend-invites-friendships.md</c>). Production auto-migrates on boot, so existing
    /// <c>AspNetUsers</c> rows need a real value before the unique
    /// <c>(DisplayName, Discriminator)</c> index can go on — the column lands with a placeholder
    /// default first, then <see cref="BackfillDiscriminatorsSql"/> assigns each existing row an
    /// actual random 4-digit value, re-rolling per-row against every other row sharing the same
    /// <c>DisplayName</c> until it finds one with no collision (same shape as
    /// <c>RoomService.NewCode()</c>'s in-process retry, just done in SQL since this runs once over
    /// however many rows already exist rather than per new account). Only then does the unique index
    /// go on, so a bad backfill would fail the migration loudly instead of silently corrupting data.
    /// </summary>
    /// <inheritdoc />
    public partial class AddDiscriminatorAndFriendships : Migration
    {
        // Assigns every existing AspNetUsers row a random 4-digit Discriminator, uniqueness scoped
        // to DisplayName (a collision against a *different* DisplayName is fine — see
        // ApplicationUser.Discriminator's own doc comment). Runs once, at migration time, over
        // whatever rows already exist — new accounts get theirs from
        // DiscriminatorAssigner.NewCandidate() at registration instead.
        private const string BackfillDiscriminatorsSql = """
            DO $$
            DECLARE
                r RECORD;
                candidate TEXT;
            BEGIN
                FOR r IN SELECT "Id", "DisplayName" FROM "AspNetUsers" LOOP
                    LOOP
                        candidate := lpad(floor(random() * 10000)::int::text, 4, '0');
                        EXIT WHEN NOT EXISTS (
                            SELECT 1 FROM "AspNetUsers"
                            WHERE "DisplayName" = r."DisplayName"
                              AND "Discriminator" = candidate
                              AND "Id" <> r."Id"
                        );
                    END LOOP;
                    UPDATE "AspNetUsers" SET "Discriminator" = candidate WHERE "Id" = r."Id";
                END LOOP;
            END $$;
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Discriminator",
                table: "AspNetUsers",
                type: "character(4)",
                fixedLength: true,
                maxLength: 4,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(BackfillDiscriminatorsSql);

            migrationBuilder.CreateTable(
                name: "Friendships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequesterId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddresseeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Friendships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Friendships_AspNetUsers_AddresseeId",
                        column: x => x.AddresseeId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Friendships_AspNetUsers_RequesterId",
                        column: x => x.RequesterId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_DisplayName_Discriminator",
                table: "AspNetUsers",
                columns: new[] { "DisplayName", "Discriminator" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Friendships_AddresseeId",
                table: "Friendships",
                column: "AddresseeId");

            migrationBuilder.CreateIndex(
                name: "IX_Friendships_RequesterId_AddresseeId",
                table: "Friendships",
                columns: new[] { "RequesterId", "AddresseeId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Friendships");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_DisplayName_Discriminator",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "Discriminator",
                table: "AspNetUsers");
        }
    }
}
