'use client';

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.accessToken) {
      fetch("https://app.launchdarkly.com/api/v2/projects", {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
        .then((res) => res.json())
        .then((data: unknown) => {
          const typedData = data as { items: Array<{ key: string }> };
          if (typedData.items?.[0]) {
            router.replace(`/projects/${typedData.items[0].key}`);
          }
        })
        .catch(console.error);
    }
  }, [session, router]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <button
          onClick={() => signIn("launchdarkly")}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Sign in with LaunchDarkly
        </button>
      </div>
    );
  }

  return <div>Loading projects...</div>;
}
