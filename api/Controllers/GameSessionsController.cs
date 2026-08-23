using Khet.Api.Data;
using Khet.Api.Domain;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GameSessionsController(KhetDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create()
    {
        var session = new GameSession
        {
            Id = Guid.NewGuid(),
            CreatedAtUtc = DateTime.UtcNow
        };

        db.GameSessions.Add(session);
        await db.SaveChangesAsync();

        return Ok(session);
    }
}
