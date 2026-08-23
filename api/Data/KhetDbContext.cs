using Khet.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Data;

public class KhetDbContext(DbContextOptions<KhetDbContext> options) : DbContext(options)
{
    public DbSet<GameSession> GameSessions => Set<GameSession>();
}
