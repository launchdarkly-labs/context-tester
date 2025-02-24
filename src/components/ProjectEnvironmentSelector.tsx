'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
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
  onProjectChange: (projectKey: string, environmentKey: string) => void;
  onEnvironmentChange: (environmentKey: string) => void;
  onEvaluate: () => void;
}

const ProjectEnvironmentSelector = ({
  currentProjectKey,
  currentEnvironmentKey,
  onProjectChange,
  onEnvironmentChange,
  onEvaluate,
}: ProjectEnvironmentSelectorProps) => {
  const { data: session } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSignOut = () => {
    signOut({
      callbackUrl: '/',
      redirect: true
    });
  };

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
      setIsLoading(true);
      fetch(`https://app.launchdarkly.com/api/v2/projects/${currentProjectKey}/environments`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
        .then((res) => res.json())
        .then((data: unknown) => {
          const typedData = data as { items: Environment[] };
          setEnvironments(typedData.items || []);
          // If we have environments and no current environment is selected, select the first one
          if (typedData.items?.length && !currentEnvironmentKey) {
            onEnvironmentChange(typedData.items[0].key);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [session, currentProjectKey]);

  const handleProjectChange = async (projectKey: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`https://app.launchdarkly.com/api/v2/projects/${projectKey}/environments`, {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
      });
      const data = await response.json() as { items: Environment[] };
      const firstEnvKey = data.items?.[0]?.key;
      if (firstEnvKey) {
        onProjectChange(projectKey, firstEnvKey);
        // Update URL without refresh
        window.history.pushState({}, '', `/projects/${projectKey}/environments/${firstEnvKey}`);
      }
    } catch (error) {
      console.error('Error fetching environments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnvironmentChange = (environmentKey: string) => {
    onEnvironmentChange(environmentKey);
    // Update URL without refresh
    window.history.pushState({}, '', `/projects/${currentProjectKey}/environments/${environmentKey}`);
  };

  return (
    <div className="flex items-center gap-4 mb-4">
      <Select.Root value={currentProjectKey} onValueChange={handleProjectChange}>
        <Select.Trigger className="inline-flex items-center justify-between rounded px-4 py-2 text-sm leading-none h-9 gap-1 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none min-w-[200px]" disabled={isLoading}>
          <Select.Value>
            {isLoading ? "Loading..." : projects.find(p => p.key === currentProjectKey)?.name || "Select project..."}
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
        <Select.Trigger className="inline-flex items-center justify-between rounded px-4 py-2 text-sm leading-none h-9 gap-1 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none min-w-[200px]" disabled={isLoading}>
          <Select.Value>
            {isLoading ? "Loading..." : environments.find(e => e.key === currentEnvironmentKey)?.name || "Select environment..."}
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

      <button
        onClick={onEvaluate}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 h-9 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading}
      >
        {isLoading ? "Loading..." : "Evaluate"}
      </button>
      
      <div className="flex-1" />
      <button
        onClick={handleSignOut}
        className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
      >
        Sign Out
      </button>
    </div>
  );
};

ProjectEnvironmentSelector.displayName = 'ProjectEnvironmentSelector';
export default ProjectEnvironmentSelector; 