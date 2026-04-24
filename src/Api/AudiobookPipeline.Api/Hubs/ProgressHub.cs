using Microsoft.AspNetCore.SignalR;

namespace AudiobookPipeline.Api.Hubs;

public class ProgressHub : Hub
{
    // Client connected
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync(
            "Connected",
            $"Connected: {Context.ConnectionId}");
        await base.OnConnectedAsync();
    }
}
