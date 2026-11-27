namespace Heliograph.Api.Hubs;

/// <summary>
/// The one place the account-scoped SignalR group name is built. <see cref="GameHub.SubscribeToUser"/>
/// joins it from the JWT's <c>sub</c> claim and controllers push to it from a <see cref="Guid"/>; a
/// mismatch between the two sends to an empty group with no error anywhere. Don't swap this for
/// SignalR's <c>Clients.User()</c>: with <c>MapInboundClaims = false</c> its default user-id provider
/// finds no id and delivers to nobody (GOTCHAS). Guarded by <c>UserGroupTests</c>.
/// </summary>
public static class UserGroup
{
    private const string Prefix = "user:";

    public static string For(Guid userId) => Prefix + userId;

    /// <summary>For the hub, which has the id as the <c>sub</c> claim's string value.</summary>
    public static string For(string userId) => Prefix + userId;
}
