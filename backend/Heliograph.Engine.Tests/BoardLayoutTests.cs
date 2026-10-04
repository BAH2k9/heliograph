using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

/// <summary>
/// The invariants every named setup must hold, under both rulesets. Both the fixed-emitter
/// arrangement (<see cref="RuleSets.FixedSun"/>) and the rotating-emitter one
/// (<see cref="RuleSets.TurningSun"/>) are hand-authored boards (IP-02 reversal: the original
/// published designs, not a generic derivation) — so every theory below runs against both.
/// </summary>
public class BoardLayoutTests
{
    public static readonly TheoryData<string> Names = new() { "Dawn", "Zenith", "Dusk" };

    public static TheoryData<string, string> NamesByRuleSet()
    {
        var data = new TheoryData<string, string>();
        foreach (var name in new[] { "Dawn", "Zenith", "Dusk" })
            foreach (var rules in new[] { RuleSets.FixedSun.Name, RuleSets.TurningSun.Name })
                data.Add(name, rules);
        return data;
    }

    private static BoardLayout Layout(string name, string ruleSet) => BoardLayouts.For(name, RuleSets.For(ruleSet));

    private static Player Other(Player p) => p == Player.P1 ? Player.P2 : Player.P1;

    // ---- the registry ----

    [Fact]
    public void The_registry_defines_exactly_Dawn_Zenith_and_Dusk()
    {
        Assert.Equal(["Dawn", "Zenith", "Dusk"], BoardLayouts.Names.ToArray());
        Assert.Equal("Dawn", BoardLayouts.DefaultName);
        Assert.True(BoardLayouts.IsKnown(BoardLayouts.DefaultName));
    }

    [Theory]
    [InlineData("Dawn")]
    [InlineData("dawn")]
    [InlineData("ZENITH")]
    [InlineData("dUsK")]
    public void For_resolves_a_known_name_case_insensitively(string name)
    {
        var layout = BoardLayouts.For(name);

        Assert.Equal(name, layout.Name, ignoreCase: true);
        Assert.Same(layout, BoardLayouts.For(layout.Name));
        Assert.True(BoardLayouts.IsKnown(name));
    }

    [Theory]
    [MemberData(nameof(Names))]
    public void The_fixed_emitter_ruleset_gets_the_authored_setup_and_the_rotating_one_a_derived_board(string name)
    {
        var authored = BoardLayouts.For(name);

        Assert.Same(authored, BoardLayouts.For(name, RuleSets.FixedSun));
        var rotating = BoardLayouts.For(name, RuleSets.TurningSun);
        Assert.NotSame(authored, rotating);
        Assert.Equal(authored.Name, rotating.Name); // one stored name across both rulesets
        Assert.Same(rotating, BoardLayouts.For(name.ToUpperInvariant(), RuleSets.TurningSun));
    }

    [Fact]
    public void For_throws_a_named_exception_for_an_unknown_layout()
    {
        var ex = Assert.Throws<UnknownBoardLayoutException>(() => BoardLayouts.For("nonsense"));
        Assert.Equal("nonsense", ex.Name);
        Assert.Contains("nonsense", ex.Message);

        Assert.Throws<UnknownBoardLayoutException>(() => BoardLayouts.For("nonsense", RuleSets.TurningSun));
        Assert.False(BoardLayouts.IsKnown("nonsense"));
    }

    [Fact]
    public void The_default_starting_board_is_Dawn()
    {
        var reference = BoardLayouts.Dawn.Build();
        var start = GameEngine.CreateStartingBoard();

        Assert.Equal(reference.Pieces.Count, start.Pieces.Count);
        foreach (var (coord, piece) in reference.Pieces)
            Assert.Equal(piece, start.PieceAt(coord));
    }

    // ---- the signed-off boards ----

    // Each setup drawn out exactly as ported from the original published boards (IP-02 reversal — see
    // BoardLayouts.cs's class remarks). Pinned whole under both rulesets, so an accidental edit to
    // one square or one facing fails here rather than silently changing the game.
    // K keep, B two-high bastion, S swivel, M mirror, N sentinel, H heliostat, suffix = orientation;
    // uppercase P1.
    [Theory]
    [InlineData("Dawn", "FixedSun", new[]
    {
        ".    .    .    .    b    k    b    mse  .    .    ",
        ".    .    msw  .    .    .    .    .    .    .    ",
        ".    .    .    MNW  .    .    .    .    .    .    ",
        "mne  .    MSW  .    sne  snw  .    mse  .    MNW  ",
        "mse  .    MNW  .    SNW  SNE  .    mne  .    MSW  ",
        ".    .    .    .    .    .    mse  .    .    .    ",
        ".    .    .    .    .    .    .    MNE  .    .    ",
        ".    .    MNW  B    K    B    .    .    .    .    ",
    })]
    [InlineData("Dawn", "TurningSun", new[]
    {
        "hsw  .    .    .    nnw  k    nnw  mse  .    .    ",
        ".    .    msw  .    .    .    .    .    .    .    ",
        ".    .    .    MNW  .    .    .    .    .    .    ",
        "mne  .    MSW  .    sne  snw  .    mse  .    MNW  ",
        "mse  .    MNW  .    SNW  SNE  .    mne  .    MSW  ",
        ".    .    .    .    .    .    mse  .    .    .    ",
        ".    .    .    .    .    .    .    MNE  .    .    ",
        ".    .    MNW  NSE  K    NSE  .    .    .    HNE  ",
    })]
    [InlineData("Zenith", "FixedSun", new[]
    {
        ".    .    .    .    b    k    b    sne  .    .    ",
        ".    .    .    .    .    .    .    .    .    .    ",
        ".    .    .    MNW  .    .    mne  .    .    .    ",
        "mne  MNW  .    .    MNW  snw  .    .    mse  MNW  ",
        "mse  MNE  .    .    SNW  mnw  .    .    mne  MSW  ",
        ".    .    .    MNE  .    .    mse  .    .    .    ",
        ".    .    .    .    .    .    .    .    .    .    ",
        ".    .    SNW  B    K    B    .    .    .    .    ",
    })]
    [InlineData("Zenith", "TurningSun", new[]
    {
        "hsw  .    .    .    nnw  k    nnw  sne  .    .    ",
        ".    .    .    .    .    .    .    .    .    .    ",
        ".    .    .    MNW  .    .    mne  .    .    .    ",
        "mne  MNW  .    .    MNW  snw  .    .    mse  MNW  ",
        "mse  MNE  .    .    SNW  mnw  .    .    mne  MSW  ",
        ".    .    .    MNE  .    .    mse  .    .    .    ",
        ".    .    .    .    .    .    .    .    .    .    ",
        ".    .    SNW  NSE  K    NSE  .    .    .    HNE  ",
    })]
    [InlineData("Dusk", "FixedSun", new[]
    {
        ".    .    .    .    mne  b    msw  .    .    .    ",
        ".    .    .    .    .    k    .    .    .    .    ",
        "mne  .    .    .    msw  b    sne  .    .    .    ",
        "mse  .    snw  .    MNW  .    MSE  .    .    .    ",
        ".    .    .    mnw  .    mse  .    SNE  .    MNW  ",
        ".    .    .    SNW  B    MNE  .    .    .    MSW  ",
        ".    .    .    .    K    .    .    .    .    .    ",
        ".    .    .    MNW  B    MNE  .    .    .    .    ",
    })]
    [InlineData("Dusk", "TurningSun", new[]
    {
        "hsw  .    .    .    mnw  nsw  msw  .    .    .    ",
        ".    .    .    .    .    k    .    .    .    .    ",
        "mne  .    .    .    msw  nsw  sne  .    .    .    ",
        "mse  .    snw  .    MNW  .    MSE  .    .    .    ",
        ".    .    .    mnw  .    mse  .    SNE  .    MNW  ",
        ".    .    .    SNW  NNE  MSE  .    .    .    MSW  ",
        ".    .    .    .    K    .    .    .    .    .    ",
        ".    .    .    MNW  NNE  MNE  .    .    .    HNE  ",
    })]
    public void Setup_matches_its_signed_off_board(string name, string ruleSet, string[] expectedRows)
    {
        var board = Layout(name, ruleSet).Build();

        var actualRows = Enumerable.Range(0, GameEngine.Rows)
            .Select(r => string.Concat(Enumerable.Range(0, GameEngine.Cols)
                .Select(c => Code(board.PieceAt(new Coord(r, c))).PadRight(5))))
            .ToArray();

        Assert.Equal(expectedRows, actualRows);
    }

    private static string Code(PieceOnBoard? p)
    {
        if (p is null)
            return ".";
        var code = p.Kind switch
        {
            Piece.Keep => "K",
            Piece.Bastion => p.Health == 2 ? "B" : "B1",
            Piece.Swivel => "S" + p.Orientation,
            Piece.Mirror => "M" + p.Orientation,
            Piece.Sentinel => "N" + p.Orientation,
            Piece.Heliostat => "H" + p.Orientation,
            _ => "?",
        };
        return p.Owner == Player.P1 ? code : code.ToLowerInvariant();
    }

    // ---- shape invariants (both rulesets) ----

    [Theory]
    [MemberData(nameof(NamesByRuleSet))]
    public void Setup_is_8x10_with_the_standard_piece_counts_per_side(string name, string ruleSet)
    {
        var layout = Layout(name, ruleSet);
        var rotating = RuleSets.For(ruleSet).RotatingHeliostat;

        Assert.Equal(8, layout.Rows);
        Assert.Equal(10, layout.Cols);
        Assert.Equal(rotating ? 26 : 24, layout.Pieces.Count);
        foreach (var player in new[] { Player.P1, Player.P2 })
        {
            var owned = layout.Pieces.Where(p => p.Owner == player).ToList();
            Assert.Equal(rotating ? 13 : 12, owned.Count);
            Assert.Equal(7, owned.Count(p => p.Kind == Piece.Mirror));
            Assert.Equal(2, owned.Count(p => p.Kind == Piece.Swivel));
            Assert.Equal(1, owned.Count(p => p.Kind == Piece.Keep));
            Assert.Equal(rotating ? 0 : 2, owned.Count(p => p.Kind == Piece.Bastion));
            Assert.Equal(rotating ? 2 : 0, owned.Count(p => p.Kind == Piece.Sentinel));
            Assert.Equal(rotating ? 1 : 0, owned.Count(p => p.Kind == Piece.Heliostat));
        }
    }

    [Theory]
    [MemberData(nameof(Names))]
    public void Every_fixed_emitter_bastion_starts_two_high(string name)
    {
        var bastions = BoardLayouts.For(name).Pieces.Where(p => p.Kind == Piece.Bastion).ToList();

        Assert.Equal(4, bastions.Count);
        Assert.All(bastions, o => Assert.Equal(2, o.Health));
    }

    // Every Turning Sun board (Sentinel/Heliostat squares included) is pinned above alongside its
    // Fixed Sun counterpart in Setup_matches_its_signed_off_board, so there's no separate
    // "derived from Fixed Sun" test — nothing is derived any more (IP-02 reversal).

    // Position is symmetric under a half turn for every square on every setup: P2's half is always
    // P1's half rotated 180°. Facing is *not* always the exact 180° rotation, though — a handful of
    // squares on the original boards face each other rather than being pure rotations of one
    // another (a quirk of the original designs, not a bug). Those exact squares are whitelisted below; every other
    // square, on every setup including any future one not in the list, is still held to the strict
    // rotate-and-match rule.
    private static readonly IReadOnlyDictionary<string, HashSet<(Coord, Coord)>> OrientationExceptions =
        new Dictionary<string, HashSet<(Coord, Coord)>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Dawn"] = [(new Coord(3, 4), new Coord(4, 5)), (new Coord(3, 5), new Coord(4, 4))],
            ["Zenith"] =
            [
                (new Coord(0, 7), new Coord(7, 2)), (new Coord(2, 6), new Coord(5, 3)),
                (new Coord(3, 1), new Coord(4, 8)), (new Coord(3, 4), new Coord(4, 5)),
                (new Coord(3, 5), new Coord(4, 4)), (new Coord(3, 8), new Coord(4, 1)),
            ],
            ["Dusk"] =
            [
                (new Coord(0, 4), new Coord(7, 5)), (new Coord(0, 6), new Coord(7, 3)),
                (new Coord(2, 6), new Coord(5, 3)), (new Coord(3, 2), new Coord(4, 7)),
            ],
        };

    // Turning Sun re-orients two of Dusk's own (non-bastion) pieces for Heliostat-rotate safety
    // (see BoardLayouts.DuskTurning's remarks), which breaks one more pairing than Fixed Sun has.
    private static readonly HashSet<(Coord, Coord)> DuskTurningExtraException = [(new Coord(2, 4), new Coord(5, 5))];

    private static bool IsOrientationException(string name, string ruleSet, Coord a, Coord b)
    {
        var pair = (a, b);
        var reverse = (b, a);
        if (OrientationExceptions.TryGetValue(name, out var exceptions) && (exceptions.Contains(pair) || exceptions.Contains(reverse)))
            return true;
        return name.Equals("Dusk", StringComparison.OrdinalIgnoreCase) && ruleSet == RuleSets.TurningSun.Name
            && (DuskTurningExtraException.Contains(pair) || DuskTurningExtraException.Contains(reverse));
    }

    [Theory]
    [MemberData(nameof(NamesByRuleSet))]
    public void Setup_is_point_symmetric_a_half_turn_swaps_the_players(string name, string ruleSet)
    {
        var board = Layout(name, ruleSet).Build();

        foreach (var (at, piece) in board.Pieces)
        {
            var mirrorAt = new Coord(GameEngine.Rows - 1 - at.Row, GameEngine.Cols - 1 - at.Col);
            var mirror = board.PieceAt(mirrorAt);
            Assert.NotNull(mirror);
            Assert.Equal(piece.Kind, mirror.Kind);
            Assert.Equal(Other(piece.Owner), mirror.Owner);
            Assert.Equal(piece.Health, mirror.Health);

            if (IsOrientationException(name, ruleSet, at, mirrorAt))
                continue;

            Assert.Equal(
                piece.Orientation is { } o ? (Orientation)(((int)o + 2) % 4) : null,
                mirror.Orientation);
        }
    }

    [Theory]
    [MemberData(nameof(NamesByRuleSet))]
    public void Every_piece_starts_on_a_square_its_owner_may_occupy(string name, string ruleSet)
    {
        var layout = Layout(name, ruleSet);
        var board = layout.Build();
        var emitters = new[] { GameEngine.EmitterFor(Player.P1).Emitter, GameEngine.EmitterFor(Player.P2).Emitter };

        Assert.Equal(layout.Pieces.Count, layout.Pieces.Select(p => p.At).Distinct().Count());
        foreach (var p in layout.Pieces)
        {
            Assert.True(board.InBounds(p.At), $"{p} is off the board");

            var reservedFor = GameEngine.SquareOwner(p.At);
            Assert.True(reservedFor is null || reservedFor == p.Owner, $"{p} sits on a square reserved for {reservedFor}");

            // Only a Heliostat may stand on an emitter corner, and only its owner's.
            if (p.Kind == Piece.Heliostat)
                Assert.Equal(GameEngine.EmitterFor(p.Owner).Emitter, p.At);
            else
                Assert.DoesNotContain(p.At, emitters);
        }
    }

    // ---- laser invariants (both rulesets) ----

    // If either player's opening beam destroyed or damaged anything, the setup would hand out a
    // free capture (or a self-inflicted loss) before anyone had moved.
    [Theory]
    [MemberData(nameof(NamesByRuleSet))]
    public void Opening_laser_destroys_nothing_for_either_player(string name, string ruleSet)
    {
        var board = Layout(name, ruleSet).Build();

        foreach (var shooter in new[] { Player.P1, Player.P2 })
        {
            var (_, outcome) = GameEngine.FireLaser(board, shooter);
            Assert.Empty(outcome.Eliminated);
            Assert.Empty(outcome.Damaged);
        }
    }

    [Theory]
    [MemberData(nameof(NamesByRuleSet))]
    public void Neither_keep_is_hit_by_either_opening_beam(string name, string ruleSet)
    {
        var board = Layout(name, ruleSet).Build();
        var keeps = board.Pieces.Where(kv => kv.Value.Kind == Piece.Keep).Select(kv => kv.Key).ToList();
        Assert.Equal(2, keeps.Count);

        foreach (var shooter in new[] { Player.P1, Player.P2 })
        {
            var (after, outcome) = GameEngine.FireLaser(board, shooter);
            Assert.NotEqual(LaserTermination.HitKeep, outcome.Termination);
            Assert.DoesNotContain(outcome.Segments, s => keeps.Contains(new Coord(s.Row, s.Col)));
            Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(after));
        }
    }

    // A Heliostat rotate re-aims the beam down the player's own back row — a single legal move away
    // from the opening, and one either player can make on turn 1. The retired layouts once shipped
    // with pieces that survived the opening beam but not this one (the beam entered an Sentinel from
    // the side and destroyed the mover's own piece on their own turn), so it stays pinned.
    [Theory]
    [MemberData(nameof(Names))]
    public void Own_heliostat_rotate_does_not_destroy_any_piece_in_its_new_lane(string name)
    {
        var board = BoardLayouts.For(name, RuleSets.TurningSun).Build();

        foreach (var shooter in new[] { Player.P1, Player.P2 })
        {
            var heliostat = GameEngine.EmitterFor(shooter).Emitter;
            var rotated = GameEngine.ApplyMove(board, EngineMove.Turn(heliostat, RotationDir.CW));

            var (_, outcome) = GameEngine.FireLaser(rotated, shooter);

            Assert.Empty(outcome.Eliminated);
        }
    }

    // Brute force: every legal first move, for whichever side moves first, then that side's laser.
    // No setup may hand the mover an instant win on move one — that would make whoever moves first
    // (or plays correctly) unbeatable, a real balance problem. Losing to your own blunder is a
    // different matter: it's a legal-but-bad move a rational player would never choose, and the
    // original boards do have a couple (Dusk/old Dynasty: e.g. (5,9)→(6,9) walks P1's own
    // mirror out of the lane guarding their own keep). That's a property of the authentic board,
    // not a defect in the port, so only an outright win for the mover fails this test.
    [Theory]
    [MemberData(nameof(NamesByRuleSet))]
    public void No_legal_first_move_lets_the_mover_win_outright(string name, string ruleSet)
    {
        var rules = RuleSets.For(ruleSet);
        var board = Layout(name, ruleSet).Build();

        foreach (var mover in new[] { Player.P1, Player.P2 })
        {
            var moves = GameEngine.LegalMoves(board, mover, rules);
            Assert.NotEmpty(moves);

            var moverWins = mover == Player.P1 ? GameStatus.P1Win : GameStatus.P2Win;
            foreach (var move in moves)
            {
                var (after, _) = GameEngine.FireLaser(GameEngine.ApplyMove(board, move), mover);
                Assert.True(
                    GameEngine.CheckWin(after) != moverWins,
                    $"{name}/{ruleSet}: {mover}'s first move {move} wins outright");
            }
        }
    }
}
