"use client";

import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Editor from "@monaco-editor/react";
import { Highlight, themes } from "prism-react-renderer";

interface ContextTesterProps {
  projectKey: string;
  environmentKey: string;
}

interface FlagEvaluation {
  [key: string]: any;
  $flagsState: {
    [key: string]: {
      variation: number;
      version: number;
      reason: {
        kind: string;
        //The key of the failed prerequisite flag, if the kind was 'PREREQUISITE_FAILED'.
        prerequisiteKey?: string,
        //The id of the rule that matched, if the kind was 'RULE_MATCH'.
        ruleId?: string
        //The index of the rule that matched, if the kind was 'RULE_MATCH'.
        ruleIndex?: number,
        //Describes the validity of Big Segment information, if and only if the flag evaluation required querying at least one Big Segment.
        bigSegmentsStatus?: "HEALTHY" | "STALE" | "NOT_CONFIGURED" | "STORE_ERROR"
        //A further description of the error condition, if the kind was 'ERROR'.
        errorKind?: string
        // if the evaluation was in an experiment
        inExperiment?: boolean



      };
    };
  };
  $valid: boolean;
}

const defaultContext = JSON.stringify({
  kind: "user",
  key: "example-user-key"
}, null, 2);

const REASON_EXPLANATIONS: Record<string, string> = {
  'OFF': 'The flag was off and therefore returned its configured off value.',
  'FALLTHROUGH': 'The flag was on but the context did not match any targets or rules.',
  'TARGET_MATCH': 'The context key was specifically targeted for this flag.',
  'RULE_MATCH': 'The context matched one of the flag\'s rules.',
  'PREREQUISITE_FAILED': 'The flag was considered off because it had at least one prerequisite flag that either was off or did not return the desired variation.',
  'ERROR': 'The flag could not be evaluated, e.g. because it does not exist or due to an unexpected error.'
};

function ReasonDisplay({ reason }: { 
  reason: { 
    kind: string;
    prerequisiteKey?: string;
    ruleId?: string;
    ruleIndex?: number;
    bigSegmentsStatus?: "HEALTHY" | "STALE" | "NOT_CONFIGURED" | "STORE_ERROR";
    errorKind?: string;
    inExperiment?: boolean;
  } 
}) {
  const explanation = REASON_EXPLANATIONS[reason.kind] || 'Unknown evaluation reason';
  
  // Build additional context based on reason type
  const details: string[] = [];
  
  if (reason.inExperiment) {
    details.push("Part of an experiment");
  }
  
  switch (reason.kind) {
    case 'PREREQUISITE_FAILED':
      if (reason.prerequisiteKey) {
        details.push(`Prerequisite flag: ${reason.prerequisiteKey}`);
      }
      break;
    case 'RULE_MATCH':
      if (reason.ruleId) {
        details.push(`Rule ID: ${reason.ruleId}`);
      }
      if (typeof reason.ruleIndex === 'number') {
        details.push(`Rule index: ${reason.ruleIndex}`);
      }
      break;
    case 'ERROR':
      if (reason.errorKind) {
        details.push(`Error type: ${reason.errorKind}`);
      }
      break;
  }

  if (reason.bigSegmentsStatus) {
    details.push(`Big segments status: ${reason.bigSegmentsStatus}`);
  }
  
  return (
    <div className="group relative inline-block">
      <span className="cursor-help" style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '0.2em' }}>
        {reason.kind}
      </span>
      <div className="invisible group-hover:visible absolute z-10 w-80 p-3 mt-2 text-sm bg-gray-900 text-white rounded shadow-lg">
        <div className="font-medium mb-1">{explanation}</div>
        {details.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-700 text-gray-300 text-xs">
            {details.map((detail, index) => (
              <div key={index} className="mt-1">{detail}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JsonViewer({ value }: { value: any }) {
  const jsonString = JSON.stringify(value, null, 2);
  return (
    <Highlight code={jsonString} language="json" theme={themes.vsLight}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${className} text-xs p-2 m-0 bg-transparent`} style={{ ...style, background: 'transparent' }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line, style: { background: 'transparent' } })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

export interface ContextTesterRef {
  evaluate: () => Promise<void>;
}

const ContextTester = forwardRef<ContextTesterRef, ContextTesterProps>(({ projectKey, environmentKey }, ref) => {
  const { data: session } = useSession();
  const [context, setContext] = useState(defaultContext);
  const [evaluations, setEvaluations] = useState<FlagEvaluation>({
    $flagsState: {},
    $valid: false,
  });
  const [error, setError] = useState<string>();


  const evaluateContext = async () => {
    if (!session) {
      signOut(); // Using signOut() from next-auth directly instead of undefined handleSignOut
      return;
    }

    try {
      const parsedContext = JSON.parse(context);
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectKey,
          environmentKey,
          context: parsedContext,
        }),
      });

      if (response.status === 401) {
        // If we get an unauthorized response, sign out
        handleSignOut();
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to evaluate flags");
      }

      const data = await response.json();
      setEvaluations(data as FlagEvaluation);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  // Call evaluateContext when the component mounts to check auth status
  useEffect(() => {
    evaluateContext();
  }, []);

  useImperativeHandle(ref, () => ({
    evaluate: evaluateContext
  }));

  return (
    <div className="flex flex-col flex-1">
    
      <div className="flex gap-4">
        <div className="w-1/2">
          <div className="h-[calc(100vh-200px)] border border-gray-300 rounded-md overflow-hidden">
            <Editor
              height="100%"
              defaultLanguage="json"
              value={context}
              onChange={(value) => setContext(value || defaultContext)}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                formatOnPaste: true,
              }}
            />
          </div>
        </div>

        <div className="w-1/2 border border-gray-300 rounded-md overflow-auto">
          {error ? (
            <div className="p-4 text-red-500">{error}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-300">
                  <th className="text-left p-4">Flag</th>
                  <th className="text-left p-4">Variation</th>
                  <th className="text-left p-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(evaluations.$flagsState).map(([key, evaluation]) => (
                  <tr key={`${projectKey}-${environmentKey}-${key}`} className="border-b border-gray-200">
                    <td className="p-4">{key}</td>
                    <td className="p-4">
                      <JsonViewer value={evaluations[key]} />
                    </td>
                    <td className="p-4">
                      <ReasonDisplay reason={evaluation.reason} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
});

ContextTester.displayName = 'ContextTester';
export default ContextTester; 