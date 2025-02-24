'use client';

import { useRef } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import ContextTester, { ContextTesterRef } from "@/components/ContextTester";

const ProjectEnvironmentSelector = dynamic(() => import("@/components/ProjectEnvironmentSelector"), {
  ssr: false
});

export default function EnvironmentPage({
  params,
}: {
  params: { projectKey: string; environmentKey: string };
}) {
  const { status } = useSession();
  const contextTesterRef = useRef<ContextTesterRef>(null);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  return (
    <main className="min-h-screen p-4">
      <ProjectEnvironmentSelector
        currentProjectKey={params.projectKey}
        currentEnvironmentKey={params.environmentKey}
        onEvaluate={() => contextTesterRef.current?.evaluate()}
      />

      <ContextTester
        ref={contextTesterRef}
        projectKey={params.projectKey}
        environmentKey={params.environmentKey}
      />
    </main>
  );
} 