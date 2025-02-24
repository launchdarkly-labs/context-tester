import NextAuth from "next-auth";
import type { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

if (!process.env.LAUNCHDARKLY_REDIRECT_URI) {
  throw new Error("LAUNCHDARKLY_REDIRECT_URI environment variable is not set");
}

export interface LaunchDarklyProfile {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface LaunchDarklyTokens {
  access_token: string;
}

interface LaunchDarklyProvider {
  userinfo?: {
    url: string;
  };
}

export const authOptions: AuthOptions = {
  providers: [
    {
      id: "launchdarkly",
      name: "LaunchDarkly",
      type: "oauth",
      authorization: {
        url: "https://app.launchdarkly.com/trust/oauth/authorize",
        params: { 
          scope: "writer",
          response_type: "code",
          redirect_uri: process.env.LAUNCHDARKLY_REDIRECT_URI
        },
      },
      token: {
        url: "https://app.launchdarkly.com/trust/oauth/token",
        async request(context) {
          const redirectUri = process.env.LAUNCHDARKLY_REDIRECT_URI;
          
          console.log("Token exchange request:", {
            clientId: context.provider.clientId,
            code: context.params.code,
            redirectUri,
            grantType: "authorization_code"
          });

          const tokenUrl = typeof context.provider.token === 'string' 
            ? context.provider.token 
            : "https://app.launchdarkly.com/trust/oauth/token";
          console.log('token params', {
            client_id: context.provider.clientId,
            client_secret: context.provider.clientSecret as string,
            code: context.params.code as string,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          } );
          const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: context.provider.clientId || "",
              client_secret: context.provider.clientSecret as string,
              code: context.params.code as string,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            } as Record<string, string>),
          });

          const data = await response.json();
          console.log("Token exchange response:", {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data
          });

          if (!response.ok) {
            throw new Error(data.error_description || data.error || response.statusText);
          }

          return {
            tokens: {
              access_token: data.access_token,
              token_type: "Bearer",
              expires_in: data.expires_in,
              refresh_token: data.refresh_token
            }
          };
        },
      },
      userinfo: {
        url: "https://app.launchdarkly.com/api/v2/users/me",
        async request(context) {
          // First get caller identity
          const identityResponse = await fetch("https://app.launchdarkly.com/api/v2/caller-identity", {
            headers: {
              Authorization: `Bearer ${context.tokens.access_token}`,
            },
          });
          console.log('access token', context.tokens.access_token);
          const identity = await identityResponse.json();
          console.log(identity);
          // Then get member details using the member ID
          const memberResponse = await fetch(`https://app.launchdarkly.com/api/v2/members/me`, {
            headers: {
              Authorization: `Bearer ${context.tokens.access_token}`,
            },
          });
          const member = await memberResponse.json();
          console.log(member);
          return {
            _id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            accountId: member.accountId,
          };
        },
      },
      clientId: process.env.LAUNCHDARKLY_CLIENT_ID,
      clientSecret: process.env.LAUNCHDARKLY_CLIENT_SECRET,
      profile(profile: LaunchDarklyProfile) {
        return {
          id: profile._id,
          name: profile.firstName + " " + profile.lastName,
          email: profile.email,
          role: profile.role,
          image: null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.profile = profile as LaunchDarklyProfile;
        // Set expiry time if provided
        if (account.expires_at) {
          token.accessTokenExpires = account.expires_at * 1000; // Convert to milliseconds
        }
      }

      // Return previous token if the access token has not expired yet
      if (token.accessTokenExpires && typeof token.accessTokenExpires === 'number' && Date.now() < token.accessTokenExpires) {
        return token;
      }

      // Access token has expired, try to refresh it
      if (token.refreshToken && typeof token.refreshToken === 'string') {
        try {
          const response = await fetch("https://app.launchdarkly.com/trust/oauth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: token.refreshToken,
              client_id: process.env.LAUNCHDARKLY_CLIENT_ID!,
              client_secret: process.env.LAUNCHDARKLY_CLIENT_SECRET!,
            } as Record<string, string>),
          });

          const data = await response.json();

          if (!response.ok) {
            throw data;
          }

          return {
            ...token,
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? token.refreshToken, // Fall back to old refresh token if not provided
            accessTokenExpires: Date.now() + (data.expires_in * 1000),
          };
        } catch (error) {
          console.error("Error refreshing access token", error);
          return { ...token, error: "RefreshAccessTokenError" };
        }
      }

      return token;
    },
    async session({ session, token }: { session: any; token: JWT & { 
      accessToken?: string; 
      refreshToken?: string;
      profile?: LaunchDarklyProfile;
      error?: string;
    } }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.user.profile = token.profile;
      return session;
    },
  },
  pages: {
   // signIn: "/login",
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 
