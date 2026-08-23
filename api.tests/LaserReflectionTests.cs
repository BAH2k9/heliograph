using Khet.Api.Domain;
using Khet.Api.Domain.Enums;

namespace Khet.Api.Tests;

public class LaserReflectionTests
{
    [Theory]
    [InlineData(Direction.Up, Orientation.NW, Direction.Left)]
    [InlineData(Direction.Up, Orientation.NE, Direction.Right)]
    [InlineData(Direction.Down, Orientation.SW, Direction.Left)]
    [InlineData(Direction.Right, Orientation.NE, Direction.Up)]
    public void Djed_reflects_a_beam_off_every_face(Direction incoming, Orientation orientation, Direction expected)
    {
        Assert.Equal(expected, LaserReflection.Djed[(incoming, orientation)]);
    }

    [Theory]
    [InlineData(Direction.Up, Orientation.NW, Direction.Left)]
    [InlineData(Direction.Up, Orientation.SE, Direction.Stop)]
    [InlineData(Direction.Left, Orientation.SW, Direction.Down)]
    public void Pyramid_reflects_off_its_mirrored_face_and_absorbs_on_its_blank_faces(
        Direction incoming, Orientation orientation, Direction expected)
    {
        Assert.Equal(expected, LaserReflection.Pyramid[(incoming, orientation)]);
    }

    [Fact]
    public void Djed_has_no_absorbing_faces_unlike_a_pyramid()
    {
        Assert.DoesNotContain(Direction.Stop, LaserReflection.Djed.Values);
    }
}
