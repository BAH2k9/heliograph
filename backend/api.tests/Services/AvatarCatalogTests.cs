using Heliograph.Api.Domain;

namespace Heliograph.Api.Tests.Services;

/// <summary>
/// Pure unit tests of the avatar preset registry — no DB, no HTTP. The web's
/// <c>Avatar.tsx</c> <c>AVATAR_IDS</c> must list the same eight ids in the same order.
/// </summary>
public class AvatarCatalogTests
{
    [Fact]
    public void Offers_exactly_the_eight_presets()
    {
        Assert.Equal(
            ["sun", "tower", "lens", "compass", "gear", "kite", "lantern", "sextant"],
            AvatarCatalog.Names);
    }

    [Fact]
    public void Resolves_a_known_id_and_rejects_anything_else()
    {
        Assert.True(AvatarCatalog.IsKnown("sextant"));
        Assert.Equal("gear", AvatarCatalog.For("gear"));

        // Case-sensitive: the id is an opaque key shared verbatim with the frontend.
        Assert.False(AvatarCatalog.IsKnown("Gear"));
        var ex = Assert.Throws<UnknownAvatarException>(() => AvatarCatalog.For("retired-preset"));
        Assert.Equal("retired-preset", ex.Id);
    }
}
