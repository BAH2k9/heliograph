using Khet.Api.Services;

namespace Khet.Api.Tests.Services;

/// <summary>Pure arithmetic tests of the Elo update, K=32, no draws (see EloService's doc comment).</summary>
public class EloServiceTests
{
    [Fact]
    public void Equal_ratings_move_by_exactly_half_of_k()
    {
        var (winner, loser) = EloService.Apply(1200, 1200);

        Assert.Equal(1216, winner); // +K/2
        Assert.Equal(1184, loser); // -K/2
    }

    [Fact]
    public void A_big_favourite_winning_gains_very_little()
    {
        var (winner, loser) = EloService.Apply(1600, 1200);

        Assert.Equal(1603, winner);
        Assert.Equal(1197, loser);
    }

    [Fact]
    public void An_upset_win_gains_close_to_the_full_k()
    {
        var (winner, loser) = EloService.Apply(1200, 1600);

        Assert.Equal(1229, winner);
        Assert.Equal(1571, loser);
    }

    [Fact]
    public void The_rating_pool_is_conserved()
    {
        var (winner, loser) = EloService.Apply(1350, 1180);

        // Independent rounding can drift the total by at most 1 point either way.
        Assert.InRange(winner + loser, 1350 + 1180 - 1, 1350 + 1180 + 1);
    }
}
