"use client";

import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Editor from "@monaco-editor/react";
import { Highlight, themes } from "prism-react-renderer";
import { useSearchParams, useRouter } from "next/navigation";

interface ContextTesterProps {
  projectKey: string;
  environmentKey: string;
}

interface FlagMetadata {
  key: string;
  name: string;
  description?: string;
  kind: string;
  temporary: boolean;
  tags: string[];
  maintainerId?: string;
  maintainer?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  _links?: {
    parent?: { href: string };
    self: { href: string };
    'text/html': { href: string };
  };
  environments: {
    [key: string]: {
      rules: Array<{
        _id: string;
        description?: string;
        clauses: Array<{
          attribute: string;
          op: string;
          values: string[];
          contextKind?: string;
        }>;
        variation?: number;
        rollout?: {
          variations: Array<{
            variation: number;
            weight: number;
          }>;
        };
      }>;
    };
  };
  variations: Array<{
    value: any;
    name?: string;
    description?: string;
  }>;
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

interface FlagsResponse {
  items: FlagMetadata[];
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

interface RuleRolloutVariation {
  variation: number;
  weight: number;
}

interface RuleRollout {
  contextKind: string;
  variations: RuleRolloutVariation[];
}

interface Rule {
  _id: string;
  description?: string;
  clauses: Array<{
    attribute: string;
    op: string;
    values: string[];
    contextKind?: string;
  }>;
  variation?: number;
  rollout?: RuleRollout;
}

function RuleDisplay({ rule, variation, variations, isFallthrough }: { 
  rule?: Rule,
  variation?: FlagMetadata['variations'][number],
  variations?: FlagMetadata['variations'],
  isFallthrough?: boolean
}) {
  if (!rule && !isFallthrough) {
    return null;
  }

  const getClauseDescription = (clause: Rule['clauses'][0]) => {
    // Special case for context kind checks
    if (clause.attribute === 'kind' && clause.contextKind) {
      return {
        contextKind: '',
        attribute: 'context kind',
        operation: clause.op === 'in' ? 'is' : clause.op
      };
    }

    const contextKind = clause.contextKind ? `${clause.contextKind} ` : '';
    const attribute = clause.attribute;
    
    let operation = '';
    switch (clause.op) {
      case 'in':
        operation = 'is one of';
        break;
      case 'endsWith':
        operation = 'ends with';
        break;
      case 'startsWith':
        operation = 'starts with';
        break;
      case 'matches':
        operation = 'matches';
        break;
      case 'contains':
        operation = 'contains';
        break;
      case 'lessThan':
        operation = 'is less than';
        break;
      case 'lessThanOrEqual':
        operation = 'is less than or equal to';
        break;
      case 'greaterThan':
        operation = 'is greater than';
        break;
      case 'greaterThanOrEqual':
        operation = 'is greater than or equal to';
        break;
      case 'segmentMatch':
        operation = 'is in segment';
        break;
      default:
        operation = clause.op;
    }

    return { contextKind, attribute, operation };
  };

  return (
    <div className="bg-white rounded-md p-3">
      {
        isFallthrough ? (
          <div className="text-sm font-medium text-gray-700 mb-3">
            <strong> Default rule</strong>
            <hr />
          </div>
        ) : (
          <></>
        )
      }
      {rule?.clauses?.map((clause, i) => {
        const { contextKind, attribute, operation } = getClauseDescription(clause);
        return (
          <div key={i} className="mb-2">
            <div className="text-sm text-gray-700">
              If {contextKind && <span className="font-bold">{contextKind.trim()}</span>} <span className="font-bold">{attribute}</span> {operation}
              <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded text-sm">
                {clause.values.join(', ')}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-2 mt-3">
        <div className="text-sm">Serve</div>
        <div className="text-blue-500">▶</div>
        <div className="text-sm group relative">
          {rule?.rollout ? (
            <div className="flex flex-col gap-1">
              <div className="text-xs text-gray-500">Percentage rollout:</div>
              {rule.rollout.variations.map((rv, i) => {
                const variationValue = variations?.[rv.variation];
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="text-sm group relative">
                      {variationValue?.name ? (
                        <>
                          {variationValue.name}
                          <div className="invisible group-hover:visible absolute left-0 z-50 w-[300px] p-3 mt-2 text-sm bg-gray-900 text-white rounded shadow-lg">
                            {variationValue.description && (
                              <div className="mb-2 text-gray-300">{variationValue.description}</div>
                            )}
                            <div className="font-mono">
                              <JsonViewer value={variationValue.value} darkMode={true} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="font-mono">
                          <JsonViewer value={variationValue?.value ?? `Variation ${rv.variation}`} darkMode={false} />
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(rv.weight / 1000).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            variation?.name ? (
              <>
                {variation.name}
                <div className="invisible group-hover:visible absolute left-0 z-50 w-[300px] p-3 mt-2 text-sm bg-gray-900 text-white rounded shadow-lg">
                  {variation.description && (
                    <div className="mb-2 text-gray-300">{variation.description}</div>
                  )}
                  <div className="font-mono">
                    <JsonViewer value={variation.value} darkMode={true} />
                  </div>
                </div>
              </>
            ) : (
              <div className="font-mono text-red-600">
                <JsonViewer value={variation?.value} darkMode={false} />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

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
    <div className="group relative">
      <span className="cursor-help" style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '0.2em' }}>
        {reason.kind}
      </span>
      <div className="invisible group-hover:visible absolute right-0 z-50 w-[calc(100vw-50%)] max-w-sm p-3 mt-2 text-sm bg-gray-900 text-white rounded shadow-lg">
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

function JsonViewer({ value, darkMode = false }: { value: any; darkMode?: boolean }) {
  const jsonString = JSON.stringify(value, null, 2);
  return (
    <Highlight code={jsonString} language="json" theme={darkMode ? themes.vsDark : themes.vsLight}>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [context, setContext] = useState(defaultContext);
  const [evaluations, setEvaluations] = useState<FlagEvaluation>({
    $flagsState: {},
    $valid: false,
  });
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [flagMetadata, setFlagMetadata] = useState<Record<string, FlagMetadata>>({});
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isCopied, setIsCopied] = useState(false);

  // Fetch flag metadata
  const fetchFlagMetadata = async () => {
    if (!session?.accessToken) return;
    
    setIsLoadingFlags(true);
    try {
      const response = await fetch(`https://app.launchdarkly.com/api/v2/flags/${projectKey}?summary=false&env=${environmentKey}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json"
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch flag metadata");
      }

      const data = await response.json() as FlagsResponse;
      const metadata: Record<string, FlagMetadata> = {};
      data.items.forEach((flag: FlagMetadata) => {
        metadata[flag.key] = flag;
      });
      setFlagMetadata(metadata);
    } catch (err) {
      console.error("Error fetching flag metadata:", err);
    } finally {
      setIsLoadingFlags(false);
    }
  };

  // Fetch flag metadata when project changes
  useEffect(() => {
    fetchFlagMetadata();
  }, [projectKey, session]);

  // Update search query in URL
  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    const params = new URLSearchParams(searchParams.toString());
    if (query) {
      params.set('q', query);
    } else {
      params.delete('q');
    }
    // Update URL without refresh
    window.history.pushState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
  };

  // Filter flags based on search query
  const filteredFlags = Object.entries(evaluations.$flagsState).filter(([key]) => {
    const flag = flagMetadata[key];
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery || 
      key.toLowerCase().includes(searchLower) || 
      flag?.name?.toLowerCase().includes(searchLower) ||
      flag?.description?.toLowerCase().includes(searchLower);
  });

  const evaluateContext = async () => {
    if (!session) {
      signOut({
        callbackUrl: '/',
        redirect: true
      });
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
        signOut({
          callbackUrl: '/',
          redirect: true
        });
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

  const toggleRow = (key: string) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(key)) {
      newExpandedRows.delete(key);
    } else {
      newExpandedRows.add(key);
    }
    setExpandedRows(newExpandedRows);
  };

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

        <div className="w-1/2 border border-gray-300 rounded-md overflow-y-auto">
          {error ? (
            <div className="p-4 text-red-500">{error}</div>
          ) : (
            <>
              <div className="sticky top-0 bg-white border-b border-gray-300 p-4">
                <input
                  type="text"
                  placeholder="Search flags..."
                  value={searchQuery}
                  onChange={(e) => updateSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchQuery && (
                  <div className="mt-2 text-sm text-gray-600">
                    Found {filteredFlags.length} matching flags
                  </div>
                )}
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <th className="text-left p-4">Flag</th>
                    <th className="text-left p-4">Variation</th>
                    <th className="text-left p-4">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingFlags ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-gray-500">
                        Loading flag information...
                      </td>
                    </tr>
                  ) : filteredFlags.map(([key, evaluation]) => (
                    <>
                      <tr 
                        key={`${projectKey}-${environmentKey}-${key}`} 
                        className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleRow(key)}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">
                              {expandedRows.has(key) ? '▼' : '▶'}
                            </span>
                            <div className="font-medium text-gray-900">
                              <a 
                                href={`https://app.launchdarkly.com/projects/${projectKey}/flags/${key}/targeting?env=${environmentKey}&selected-env=${environmentKey}${
                                  evaluation.reason.kind === 'RULE_MATCH' && evaluation.reason.ruleId 
                                    ? `#${evaluation.reason.ruleId}`
                                    : evaluation.reason.kind === 'FALLTHROUGH'
                                    ? '#defaultrule'
                                    : evaluation.reason.kind === 'PREREQUISITE_FAILED' && evaluation.reason.prerequisiteKey
                                    ? `#prerequisites-${evaluation.reason.prerequisiteKey}`
                                    : ''
                                }`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {flagMetadata[key]?.name || key}
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="group relative">
                            {flagMetadata[key]?.variations?.[evaluation.variation]?.name ? (
                              <>
                                {flagMetadata[key]?.variations?.[evaluation.variation]?.name}
                                <div className="invisible group-hover:visible absolute left-0 z-50 w-[300px] p-3 mt-2 text-sm bg-gray-900 text-white rounded shadow-lg">
                                  {flagMetadata[key]?.variations?.[evaluation.variation]?.description && (
                                    <div className="mb-2 text-gray-300">{flagMetadata[key]?.variations?.[evaluation.variation]?.description}</div>
                                  )}
                                  <div className="font-mono">
                                    <JsonViewer value={evaluations[key]} darkMode={true} />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="font-mono">
                                <JsonViewer value={evaluations[key]} darkMode={false} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <ReasonDisplay reason={evaluation.reason} />
                        </td>
                      </tr>
                      {expandedRows.has(key) && (
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <td colSpan={3} className="p-4">
                            <div className="space-y-4">
                              <div 
                                className={`text-xs ${
                                  isCopied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                } rounded-full px-3 py-1 inline-flex items-center gap-2 cursor-pointer hover:bg-gray-200 group relative transition-colors`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(key).then(() => {
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 1000);
                                  });
                                }}
                              >
                                {key}
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-colors ${isCopied ? 'text-green-700' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 -top-8 bg-gray-900 text-white px-2 py-1 rounded text-xs whitespace-nowrap">
                                  {isCopied ? 'Copied!' : 'Click to copy'}
                                </span>
                              </div>
                              {flagMetadata[key]?.description && (
                                <div className="text-sm text-gray-700">
                                  {flagMetadata[key].description}
                                </div>
                              )}
                              {evaluation.reason.kind === 'RULE_MATCH' && evaluation.reason.ruleId && (
                                <>
                                  <div className="bg-white rounded-md p-3">
                                    <div className="text-sm font-medium text-gray-700 mb-3">
                                      <strong>Matched Rule</strong>: {flagMetadata[key]?.environments?.[environmentKey]?.rules?.find(r => r._id === evaluation.reason.ruleId)?.description}
                                      <hr />
                                    </div>
                                    {(() => {
                                      const matchedRule = flagMetadata[key]?.environments?.[environmentKey]?.rules?.find(r => r._id === evaluation.reason.ruleId) as Rule | undefined;
                                      if (!matchedRule) return null;
                                      
                                      return (
                                        <RuleDisplay 
                                          rule={matchedRule} 
                                          variation={flagMetadata[key]?.variations?.[evaluation.variation]} 
                                          variations={flagMetadata[key]?.variations}
                                        />
                                      );
                                    })()}
                                  </div>
                                </>
                              )}
                              {evaluation.reason.kind === 'FALLTHROUGH' && (
                                <div className="bg-white rounded-md p-3">
                                  <RuleDisplay 
                                    isFallthrough={true}
                                    variation={flagMetadata[key]?.variations?.[evaluation.variation]}
                                    variations={flagMetadata[key]?.variations}
                                  />
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-200">
                                {flagMetadata[key]?.tags?.map((tag) => (
                                  <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                                    {tag}
                                  </span>
                                ))}
                                {flagMetadata[key]?.temporary && (
                                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                                    Temporary
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {!isLoadingFlags && filteredFlags.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-gray-500">
                        {searchQuery ? "No matching flags found" : "No flags available"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

ContextTester.displayName = 'ContextTester';
export default ContextTester; 