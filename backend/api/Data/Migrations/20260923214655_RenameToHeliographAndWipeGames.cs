using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Heliograph.Api.Data.Migrations
{
    /// <summary>
    /// The Heliograph rebrand's data migration (IP-09). The owner's decision, made ahead of
    /// launch while game history could still be discarded: wipe every game and keep every
    /// account. This is deliberately irreversible for the deleted rows - see the comment on
    /// <see cref="Down"/>.
    ///
    /// Order of operations, and why:
    /// 1. Delete every game-linked <c>MatchInvites</c> row first (the FK from MatchInvites to
    ///    Games is ON DELETE SET NULL, not CASCADE, so a plain Games delete would silently leave
    ///    these rows behind with a dangling reference to a game that no longer exists instead of
    ///    removing them - the brief calls for deleting them, not orphaning them).
    /// 2. Delete every <c>Moves</c> row (the FK to Games is CASCADE, so this step is technically
    ///    redundant once Games are deleted below, but it's done explicitly and in FK order per
    ///    the item's instructions, rather than relying on the cascade to do it implicitly).
    /// 3. Delete every <c>Games</c> row.
    /// 4. Remap every stored <c>AspNetUsers.AvatarId</c> from the retired Khet-themed catalogue
    ///    to IP-03's new one, one to one (see the table in Remediation/IP-09 and IP-03). Any
    ///    value that's already a new id, or anything unrecognised, is left/set to NULL, which the
    ///    frontend already renders as the display name's initial.
    /// 5. Any <c>MatchInvites</c> row that survives step 1 (a pending invite never linked to a
    ///    game) is remapped rather than deleted: a retired <c>Layout</c> name becomes
    ///    <c>Dawn</c> (there's no faithful mapping - the new setups aren't the old ones), and a
    ///    retired <c>Ruleset</c> name is renamed to its new wire id (Classic -> FixedSun,
    ///    Khet2 -> TurningSun) rather than replaced, since the ruleset rename is a straight
    ///    like-for-like id change, not a redesign.
    /// 6. Only then do the two column-default ALTER COLUMNs run, so the new defaults apply to
    ///    every row inserted after this migration, not to the rows already handled above.
    /// </summary>
    public partial class RenameToHeliographAndWipeGames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Game-linked MatchInvites first (FK order; this FK is ON DELETE SET NULL, not
            // CASCADE, so it has to be handled explicitly before the Games delete below).
            migrationBuilder.Sql(
                """
                DELETE FROM "MatchInvites" WHERE "GameId" IS NOT NULL;
                """);

            // 2. Moves (FK to Games is CASCADE; explicit for FK-order clarity and to not depend
            // on the cascade being configured the way this comment assumes).
            migrationBuilder.Sql(
                """
                DELETE FROM "Moves";
                """);

            // 3. Games.
            migrationBuilder.Sql(
                """
                DELETE FROM "Games";
                """);

            // 4. AspNetUsers.AvatarId: IP-03's old -> new mapping. NULL stays NULL. Anything not
            // in the old set (already a new id, or unrecognised) is left/set to NULL.
            migrationBuilder.Sql(
                """
                UPDATE "AspNetUsers"
                SET "AvatarId" = CASE "AvatarId"
                    WHEN 'pharaoh' THEN 'sun'
                    WHEN 'obelisk' THEN 'tower'
                    WHEN 'pyramid' THEN 'lens'
                    WHEN 'anubis' THEN 'compass'
                    WHEN 'sphinx' THEN 'gear'
                    WHEN 'scarab' THEN 'kite'
                    WHEN 'ankh' THEN 'lantern'
                    WHEN 'eye-of-horus' THEN 'sextant'
                    ELSE NULL
                END
                WHERE "AvatarId" IS NOT NULL
                  AND "AvatarId" NOT IN ('sun', 'tower', 'lens', 'compass', 'gear', 'kite', 'lantern', 'sextant');
                """);

            // 5. Any MatchInvites row that survived step 1 (never linked to a game) - remap a
            // retired layout to Dawn, and a retired ruleset id to its new wire id.
            migrationBuilder.Sql(
                """
                UPDATE "MatchInvites"
                SET "Layout" = 'Dawn'
                WHERE "Layout" IN ('Classic', 'Imhotep', 'Dynasty', 'Khet2Classic', 'Khet2Imhotep', 'Khet2Dynasty');
                """);
            migrationBuilder.Sql(
                """
                UPDATE "MatchInvites"
                SET "Ruleset" = CASE "Ruleset" WHEN 'Classic' THEN 'FixedSun' WHEN 'Khet2' THEN 'TurningSun' ELSE "Ruleset" END
                WHERE "Ruleset" IN ('Classic', 'Khet2');
                """);

            // 6. New column defaults, for every row inserted from here on.
            migrationBuilder.AlterColumn<string>(
                name: "Ruleset",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "FixedSun",
                oldClrType: typeof(string),
                oldType: "character varying(16)",
                oldMaxLength: 16,
                oldDefaultValue: "Classic");

            migrationBuilder.AlterColumn<string>(
                name: "Layout",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Dawn",
                oldClrType: typeof(string),
                oldType: "character varying(16)",
                oldMaxLength: 16,
                oldDefaultValue: "Classic");
        }

        /// <summary>
        /// Best-effort reverse of the two column defaults ONLY. The deletes (MatchInvites, Moves,
        /// Games) and the data remaps (AspNetUsers.AvatarId, and any surviving MatchInvites'
        /// Layout/Ruleset) in <see cref="Up"/> are irreversible - the original rows and values are
        /// gone, not archived anywhere this migration can read them back from. Running this Down
        /// restores the pre-rebrand column defaults but not a single deleted or remapped row.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Ruleset",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Classic",
                oldClrType: typeof(string),
                oldType: "character varying(16)",
                oldMaxLength: 16,
                oldDefaultValue: "FixedSun");

            migrationBuilder.AlterColumn<string>(
                name: "Layout",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Classic",
                oldClrType: typeof(string),
                oldType: "character varying(16)",
                oldMaxLength: 16,
                oldDefaultValue: "Dawn");
        }
    }
}
