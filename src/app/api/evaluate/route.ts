import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { init, LDContext } from "@launchdarkly/node-server-sdk";

interface EvaluateRequest {
  projectKey: string;
  environmentKey: string;
  context: LDContext;
}

interface EnvironmentResponse {
  apiKey: string;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { projectKey, environmentKey, context } = body as EvaluateRequest;

    if (!projectKey || !environmentKey || !context) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Get the SDK key for the environment
    const response = await fetch(
      `https://app.launchdarkly.com/api/v2/projects/${projectKey}/environments/${environmentKey}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch environment" },
        { status: response.status }
      );
    }

    const envData = (await response.json()) as EnvironmentResponse;
    const sdkKey = envData.apiKey;

    if (!sdkKey) {
      return NextResponse.json(
        { error: "Could not get SDK key" },
        { status: 500 }
      );
    }

    // Initialize the LaunchDarkly client
    const client = init(sdkKey);
    await client.waitForInitialization();

    try {
      // Get all flags state with reasons
      const allFlags = await client.allFlagsState(context, {
        withReasons: true,
        detailsOnlyForTrackedFlags: false,
      }); 

      // Close the client
      await client.close();

      // Transform the flags state into the expected format
      
      

      return NextResponse.json(allFlags.toJSON());
    } finally {
      // Ensure the client is closed even if there's an error
      await client.close();
    }
  } catch (error) {
    console.error("Error evaluating flags:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 