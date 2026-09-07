FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Build context is the repo root (see docker-compose.yml). Restore off the
# csprojs alone first so the restore layer caches independently of source edits;
# Khet.Api.csproj references ../Khet.Engine, so that csproj has to come too.
COPY api/Khet.Api.csproj api/
COPY Khet.Engine/Khet.Engine.csproj Khet.Engine/
RUN dotnet restore api/Khet.Api.csproj
COPY api/ api/
COPY Khet.Engine/ Khet.Engine/
RUN dotnet publish api/Khet.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Khet.Api.dll"]
