import {QueryOptions} from './options';
import {Observable, Subscription} from 'rxjs';
import {scope} from 'ngx-plumber';
import {Buoy} from '../buoy';
import {Wrapper} from './wrapper';
import {QueryPagination} from './query-pagination';


export class Query extends Wrapper {
    private _query;
    private _querySubscription: Subscription;
    private _queryPagination: QueryPagination;

    private _initialized = false;

    public data: any;

    public loading = true;

    constructor(buoy: Buoy, id: number, query, private _variables, protected _options: QueryOptions) {
        super(buoy, id, 'query');
        this.debug('debug', 'Initializing Query...');

        // Init QueryPagination
        this._queryPagination = new QueryPagination(buoy, _options, query, _variables); // TODO: Re-init if _options.pagination changes.

        this._query = this.buoy.apollo.watchQuery({
            query: this._queryPagination.query, // Use the manipulated query
            variables: this.variables // Use manipulated variables
        });

        // Subscribe to changes
        this._querySubscription = this._query.valueChanges.subscribe((data) => this.mapResponse(data, 'http'));

        this._initialized = true;

        this.debug('debug', 'Query initialized successfully.');
        return this;
    }

    public get pagination() {
        console.log('PAGINATION :: ', this._queryPagination.pagination);
        return this._queryPagination.pagination;
    }

    public refetch(): this {
        this.debug('debug', 'Refecthing data...');
        if (this._initialized) {
            this._query.refetch(this.variables);
        }

        return this;
    }

    public setVariable(variable: string, value: any): this {
        this._variables[variable] = value;

        this.debug('debug', 'Variable ' + variable + ' has been set to:', value);
        return this;
    }

    /**
     * Go to the previous page.
     */
    public prevPave(refetch = true, paginator?: string): this {
        if (refetch === true && this._queryPagination.prevPage(paginator)) {
            this.refetch();
        }

        return this;
    }

    /**
     * Go the the next page.
     */
    public nextPage(refetch = true, paginator?: string): this {
        if (refetch === true && this._queryPagination.nextPage(paginator)) {
            this.refetch();
        }

        return this;
    }

    /**
     * Set the page.
     */
    public setPage(page: number | string, refetch = true, paginator?: string): this {
        if (refetch === true && this._queryPagination.setPage(page, paginator)) {
            this.refetch();
        }

        return this;
    }

    /**
     * Set the limit.
     */
    public setLimit(limit: number, refetch = true, paginator?: string): this {
        this._queryPagination.setLimit(limit, paginator);

        if (refetch === true) {
            this.refetch();
        }

        return this;
    }

    public destroy(): void {
        alert('Destroyed query object.'); // TODO can Angular's built-in lifecycle hooks be used?
        this.debug('debug', 'Query has been destroyed.');
    }

    private get variables() {
        // Inject variables from QqueryPagination
        let variables = Object.assign(this._variables, this._queryPagination.variables);

        // Run middlewares
        this.buoy._config.middleware.forEach((middleware) => {
            // TODO Make sure that the method exists on the Middleware class
            variables = new middleware(this.buoy).manipulateVariables(this._queryPagination.query, variables, this._options);
        });

        return variables;
    }

    private applyOptions(options: QueryOptions): void {

    }

    private mapResponse(data, mode: 'http' | 'ws'): void {
        // Set loading
        this.loading = data.loading; // TODO Necessary?

        this._queryPagination.readPaginationFromResponse(data);

        // Set data
        this.data = scope(data.data, this._options.scope);

        this.debug(
            'debug',
            'Mapped response.',
            { input: data, output: this.data}
        );
    }
}
