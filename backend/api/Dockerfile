FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Build context is backend/ (see infra/docker-compose.yml). Restore off the
# csprojs alone first so the restore layer caches independently of source edits;
# Khet.Api.csproj references ../Khet.Engine, ../Khet.Clock and ../Khet.Contracts,
# so those csprojs have to come too.
COPY api/Khet.Api.csproj api/
COPY Khet.Engine/Khet.Engine.csproj Khet.Engine/
COPY Khet.Clock/Khet.Clock.csproj Khet.Clock/
COPY Khet.Contracts/Khet.Contracts.csproj Khet.Contracts/
RUN dotnet restore api/Khet.Api.csproj
COPY api/ api/
COPY Khet.Engine/ Khet.Engine/
COPY Khet.Clock/ Khet.Clock/
COPY Khet.Contracts/ Khet.Contracts/
RUN dotnet publish api/Khet.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Khet.Api.dll"]
