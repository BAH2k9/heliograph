using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Heliograph.Api.Data.Migrations
{
    /// <summary>
    /// Adds the nullable <c>AvatarId</c> column backing <c>ApplicationUser.AvatarId</c> — one of the
    /// 8 pinned <c>AvatarCatalog.Names</c> ids, or null (no default value: null carries meaning, "no
    /// avatar picked yet", not "pick one for me" — see <c>ApplicationUser.AvatarId</c>'s doc comment).
    /// </summary>
    /// <inheritdoc />
    public partial class AddAvatarId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AvatarId",
                table: "AspNetUsers",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarId",
                table: "AspNetUsers");
        }
    }
}
