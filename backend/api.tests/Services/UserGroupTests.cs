using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using Heliograph.Api.Hubs;

namespace Heliograph.Api.Tests.Services;

/// <summary>
/// The account-scoped SignalR group is joined in <c>GameHub.SubscribeToUser</c> and pushed to from
/// several controllers. A typo in any one copy of the name sends to an empty group with no error,
/// so every site must go through <see cref="UserGroup.For(Guid)"/>. No Postgres.
/// </summary>
public class UserGroupTests
{
    [Fact]
    public void Guid_and_sub_claim_string_produce_the_same_group()
    {
        var id = Guid.NewGuid();
        // The hub reads the id from the JWT's `sub` claim, which JwtTokenService writes as Guid.ToString().
        Assert.Equal(UserGroup.For(id), UserGroup.For(id.ToString()));
        Assert.Equal($"user:{id}", UserGroup.For(id));
    }

    [Fact]
    public void No_api_source_file_builds_the_user_group_name_inline()
    {
        var apiDir = Path.Combine(BackendDir(), "api");
        var inline = new Regex("\\$\"user:\\{");
        var offenders = Directory.EnumerateFiles(apiDir, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                     && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .Where(f => inline.IsMatch(File.ReadAllText(f)))
            .Select(f => Path.GetRelativePath(apiDir, f))
            .ToList();

        Assert.Empty(offenders);
    }

    private static string BackendDir([CallerFilePath] string thisFile = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", ".."));
}
