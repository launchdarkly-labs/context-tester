'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as Select from "@radix-ui/react-select";

interface Project {
  key: string;
  name: string;
}

interface Environment {
  key: string;
  name: string;
}

interface ProjectEnvironmentSelectorProps {
  currentProjectKey: string;
  currentEnvironmentKey: string;
  onEvaluate: () => void;
}

const ProjectEnvironmentSelector = ({
  currentProjectKey,
  currentEnvironmentKey,
  onEvaluate,
}: ProjectEnvironmentSelectorProps) => {
  const { data: session } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);

  useEffect(() => {
    if (session?.accessToken) {
      fetch("https://app.launchdarkly.com/api/v2/projects", {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
        .then((res) => res.json())
        .then((data: unknown) => {
          const typedData = data as { items: Project[] };
          setProjects(typedData.items || []);
        })
        .catch(console.error);
    }
  }, [session]);

  useEffect(() => {
    if (session?.accessToken && currentProjectKey) {
      fetch(`https://app.launchdarkly.com/api/v2/projects/${currentProjectKey}/environments`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
        .then((res) => res.json())
        .then((data: unknown) => {
          const typedData = data as { items: Environment[] };
          setEnvironments(typedData.items || []);
        })
        .catch(console.error);
    }
  }, [session, currentProjectKey]);

  const handleProjectChange = (projectKey: string) => {
    router.push(`/projects/${projectKey}`);
  };

  const handleEnvironmentChange = (environmentKey: string) => {
    router.push(`/projects/${currentProjectKey}/environments/${environmentKey}`);
  };

  return (
    <div className="flex items-center gap-4 mb-4">
      <Select.Root value={currentProjectKey} onValueChange={handleProjectChange}>
        <Select.Trigger className="inline-flex items-center justify-between rounded px-4 py-2 text-sm leading-none h-9 gap-1 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none min-w-[200px]">
          <Select.Value>
            {projects.find(p => p.key === currentProjectKey)?.name || "Select project..."}
          </Select.Value>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="overflow-hidden bg-white rounded-md shadow-lg">
            <Select.Viewport className="p-2">
              {projects.map((project) => (
                <Select.Item
                  key={project.key}
                  value={project.key}
                  className="relative flex items-center px-8 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-100 focus:bg-gray-100 cursor-pointer outline-none"
                >
                  <Select.ItemText>{project.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <Select.Root value={currentEnvironmentKey} onValueChange={handleEnvironmentChange}>
        <Select.Trigger className="inline-flex items-center justify-between rounded px-4 py-2 text-sm leading-none h-9 gap-1 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none min-w-[200px]">
          <Select.Value>
            {environments.find(e => e.key === currentEnvironmentKey)?.name || "Select environment..."}
          </Select.Value>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="overflow-hidden bg-white rounded-md shadow-lg">
            <Select.Viewport className="p-2">
              {environments.map((env) => (
                <Select.Item
                  key={env.key}
                  value={env.key}
                  className="relative flex items-center px-8 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-100 focus:bg-gray-100 cursor-pointer outline-none"
                >
                  <Select.ItemText>{env.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <div className="flex-1" />
      <button
        onClick={onEvaluate}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 h-9"
      >
        Evaluate
      </button>
    </div>
  );
};

ProjectEnvironmentSelector.displayName = 'ProjectEnvironmentSelector';
export default ProjectEnvironmentSelector; 