namespace Heliograph.Api.Services;

/// <summary>
/// Standard Elo rating update, K=32, no draws (Khet's <c>GameStatus</c> only ever resolves to a
/// win for one side). Pure and stateless — <c>GameService</c> owns deciding *whether* a finished
/// game is <see cref="Domain.Game.Rated"/>; this just does the arithmetic.
/// </summary>
public static class EloService
{
    private const int KFactor = 32;

    /// <summary>Returns the winner's and loser's new ratings after a decisive game.</summary>
    public static (int WinnerRating, int LoserRating) Apply(int winnerRatingBefore, int loserRatingBefore)
    {
        var expectedWinner = 1.0 / (1.0 + Math.Pow(10.0, (loserRatingBefore - winnerRatingBefore) / 400.0));
        var winnerRating = winnerRatingBefore + KFactor * (1.0 - expectedWinner);
        var loserRating = loserRatingBefore - KFactor * (1.0 - expectedWinner);
        return ((int)Math.Round(winnerRating), (int)Math.Round(loserRating));
    }
}
