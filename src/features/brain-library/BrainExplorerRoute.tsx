import { ErrorBoundary } from "../../components/ErrorBoundary";
import { BrainExplorer } from "../brain-explorer/BrainExplorer";

export default function BrainExplorerRoute() {
  return (
    <div className="wb-page wb-graph-route" data-testid="brain-explorer-route">
      <section className="wb-page-heading">
        <div>
          <span className="wb-kicker">Team Library · How things connect</span>
          <h1>Trace the context behind a decision.</h1>
          <p>
            The graph loads only when you open it. Search a node, follow its evidence, and return to
            the daily Workbench when you are done.
          </p>
        </div>
        <span className="wb-status wb-status-neutral">Loaded on demand</span>
      </section>
      <div className="graph-cockpit full-bleed">
        <ErrorBoundary>
          <BrainExplorer />
        </ErrorBoundary>
      </div>
    </div>
  );
}
