using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Khet.Api.Data;
using Khet.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of <c>POST /api/games/{id}/bug-reports</c> (backlog/10-bug-traceability.md):
/// success + persisted row, 404 on an unknown game, 401 anonymous, 413 oversize, and that the row's
/// <see cref="Khet.Api.Domain.BugReport.GameId"/> survives the game itself being deleted (the
/// <c>SetNull</c> FK behavior). Skips (doesn't fail) when no Postgres is reachable, same convention
/// as the rest of <c>Api/</c>.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class BugReportIntegrationTests(IntegrationFixture fixture)
{
    private const string Pw = "correct-horse-1";

    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();
    private static KhetDbContext Db(AsyncServiceScope scope) => scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    private async Task<HttpClient> NewUserClientAsync()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var auth = await fixture.RegisterAsync(password: Pw);
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    private static BugReportRequest NewRequest(JsonElement? bundle = null) => new(
        Seat: "P1",
        ConnectionId: "conn-abc",
        MoveCount: 5,
        Turn: "P2",
        Status: "InProgress",
        ServerOffsetMs: 120,
        LastTraceId: Guid.NewGuid().ToString(),
        ClientCapturedAtUtc: DateTime.UtcNow,
        Bundle: bundle ?? JsonSerializer.SerializeToElement(new { ring = new[] { "moveApplied", "opponentDisconnected" } }));

    [SkippableFact]
    public async Task Files_a_bug_report_and_persists_it_with_the_right_game_and_user()
    {
        var client = await NewUserClientAsync();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/bug-reports", NewRequest());
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var ack = (await res.Content.ReadFromJsonAsync<BugReportAck>())!;
        Assert.NotEqual(Guid.Empty, ack.Id);

        await using var scope = Scope();
        var row = await Db(scope).BugReports.AsNoTracking().SingleAsync(r => r.Id == ack.Id);
        Assert.Equal(game.Id, row.GameId);
        Assert.NotNull(row.UserId);
        Assert.Equal("P1", row.Seat);
        Assert.Equal(5, row.MoveCount);
        Assert.Contains("moveApplied", row.BundleJson);
    }

    [SkippableFact]
    public async Task Returns_404_for_an_unknown_game()
    {
        var client = await NewUserClientAsync();
        var res = await client.PostAsJsonAsync($"/api/games/{Guid.NewGuid()}/bug-reports", NewRequest());
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [SkippableFact]
    public async Task Rejects_anonymous_callers()
    {
        var client = NewClient();
        var res = await client.PostAsJsonAsync($"/api/games/{Guid.NewGuid()}/bug-reports", NewRequest());
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    public async Task Rejects_an_oversize_bundle_with_413()
    {
        var client = await NewUserClientAsync();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        // Comfortably over the 256 KB RequestSizeLimit. Whether TestServer surfaces this as the
        // framework's 413 or as a lower-level 400 (some hosts reject an oversize body before
        // RequestSizeLimitAttribute even runs) is host-dependent — either is acceptable here, the
        // point is that it's rejected rather than accepted.
        var oversizeBundle = JsonSerializer.SerializeToElement(new { padding = new string('x', 400_000) });
        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/bug-reports", NewRequest(oversizeBundle));
        Assert.True(
            res.StatusCode is HttpStatusCode.RequestEntityTooLarge or HttpStatusCode.BadRequest,
            $"expected 413 or 400 for an oversize bundle, got {res.StatusCode}");
    }

    [SkippableFact]
    public async Task GameId_survives_game_deletion_as_null()
    {
        var client = await NewUserClientAsync();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/bug-reports", NewRequest());
        var ack = (await res.Content.ReadFromJsonAsync<BugReportAck>())!;

        await using (var scope = Scope())
        {
            var db = Db(scope);
            db.Games.Remove(await db.Games.SingleAsync(g => g.Id == game.Id));
            await db.SaveChangesAsync();
        }

        await using (var scope = Scope())
        {
            var row = await Db(scope).BugReports.AsNoTracking().SingleAsync(r => r.Id == ack.Id);
            Assert.Null(row.GameId);
        }
    }
}
