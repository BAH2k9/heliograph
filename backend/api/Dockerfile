FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Build context is backend/ (see infra/docker-compose.yml). Restore off the
# csprojs alone first so the restore layer caches independently of source edits;
# Heliograph.Api.csproj references ../Heliograph.Engine, ../Heliograph.Clock and ../Heliograph.Contracts,
# so those csprojs have to come too.
COPY api/Heliograph.Api.csproj api/
COPY Heliograph.Engine/Heliograph.Engine.csproj Heliograph.Engine/
COPY Heliograph.Clock/Heliograph.Clock.csproj Heliograph.Clock/
COPY Heliograph.Contracts/Heliograph.Contracts.csproj Heliograph.Contracts/
RUN dotnet restore api/Heliograph.Api.csproj
COPY api/ api/
COPY Heliograph.Engine/ Heliograph.Engine/
COPY Heliograph.Clock/ Heliograph.Clock/
COPY Heliograph.Contracts/ Heliograph.Contracts/
RUN dotnet publish api/Heliograph.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Heliograph.Api.dll"]
