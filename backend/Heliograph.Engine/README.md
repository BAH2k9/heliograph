# Heliograph.Engine

The rules engine for [Heliograph](https://github.com/BAH2k9/heliograph), a board game of mirrors and
light. It covers move legality, the laser trace, win detection, the named board layouts and the rule
variants. It is the same engine the Heliograph server uses to referee games.

The engine is pure and deterministic. It does no I/O, uses no clock and no randomness, and depends on
nothing beyond the .NET base class library. Every method takes an immutable `Board` and returns a new one.

## Install

```
dotnet add package Heliograph.Engine
```

Targets `net10.0`.

## A turn

A turn is one move, then the mover's laser fires. A player whose Keep is destroyed loses.

```csharp
using Heliograph.Engine;
using Heliograph.Engine.Enums;

var rules = RuleSets.FixedSun;                        // or RuleSets.TurningSun
var board = BoardLayouts.For("Dawn", rules).Build();  // also "Zenith", "Dusk"
var toMove = Player.P1;

var moves = GameEngine.LegalMoves(board, toMove, rules);
board = GameEngine.ApplyMove(board, moves[0]);

var (afterLaser, outcome) = GameEngine.FireLaser(board, toMove);
var status = GameEngine.CheckWin(afterLaser);         // InProgress, P1Win or P2Win
```

`GameEngine.ValidateMove` explains why a single move is illegal. Pass the same `RuleSet` to
`LegalMoves` and `ValidateMove` that you used to pick the layout: stacking moves exist only under
`FixedSun`.

## Versioning

The package version is set from the `engine-v*` tag it was published from. Bots and tools that record
games should store the engine version with each game, because a rule change makes results from
different versions incomparable.

## Licence

MIT.
