'use client';

import { useRef, useState } from "react";
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
  const [currentProject, setCurrentProject] = useState(params.projectKey);
  const [currentEnvironment, setCurrentEnvironment] = useState(params.environmentKey);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  const handleProjectChange = (projectKey: string, environmentKey: string) => {
    setCurrentProject(projectKey);
    setCurrentEnvironment(environmentKey);
    // Trigger evaluation with new project/environment
    contextTesterRef.current?.evaluate();
  };

  const handleEnvironmentChange = (environmentKey: string) => {
    setCurrentEnvironment(environmentKey);
    // Trigger evaluation with new environment
    contextTesterRef.current?.evaluate();
  };

  return (
    <main className="min-h-screen p-4">
      <ProjectEnvironmentSelector
        currentProjectKey={currentProject}
        currentEnvironmentKey={currentEnvironment}
        onProjectChange={handleProjectChange}
        onEnvironmentChange={handleEnvironmentChange}
        onEvaluate={() => contextTesterRef.current?.evaluate()}
      />

      <ContextTester
        ref={contextTesterRef}
        projectKey={currentProject}
        environmentKey={currentEnvironment}
      />
    </main>
  );
} 