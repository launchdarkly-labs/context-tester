'use client';

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ProjectPage({
  params,
}: {
  params: { projectKey: string };
}) {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.accessToken) {
      // Fetch environments and redirect to the first one
      fetch(`https://app.launchdarkly.com/api/v2/projects/${params.projectKey}/environments`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
        .then((res) => res.json())
        .then((data: unknown) => {
          const typedData = data as { items: Array<{ key: string }> };
          if (typedData.items?.[0]) {
            router.replace(`/projects/${params.projectKey}/environments/${typedData.items[0].key}`);
          }
        })
        .catch(console.error);
    }
  }, [session, params.projectKey, router]);

  return <div>Loading environments...</div>;
} 