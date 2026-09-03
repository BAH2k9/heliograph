namespace Khet.Api.Engine;

/// <summary>Result of <see cref="GameEngine.ValidateMove"/>. <see cref="Reason"/> is non-null iff illegal.</summary>
public sealed record MoveValidation(bool IsLegal, string? Reason)
{
    public static readonly MoveValidation Ok = new(true, null);

    public static MoveValidation Fail(string reason) => new(false, reason);
}
