using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khet.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRulesetAndLayout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Layout",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Classic");

            migrationBuilder.AddColumn<string>(
                name: "Ruleset",
                table: "Games",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Classic");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Layout",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "Ruleset",
                table: "Games");
        }
    }
}
