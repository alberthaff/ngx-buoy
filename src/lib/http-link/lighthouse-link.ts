import { Buoy } from '../buoy';
import { ApolloLink, Operation, RequestHandler, Observable, FetchResult } from 'apollo-link';
import { print } from 'graphql/language/printer';
import { extractFiles } from 'extract-files';
import { Context } from './lighthouse-link-options';
import { isFunction } from 'ngx-plumber';

export class LighthouseLink extends ApolloLink {
    public requester: RequestHandler;

    constructor(private buoy: Buoy) {
        super();
        console.log('BUOY SUB', this.buoy.config);
        // this.initSubscriptions(options.subscriptions);

        this.requester = (operation: Operation) => new Observable((observer: any) => {
            const context: Context = operation.getContext();

            const includeExtensions = true; // TODO
            // const includeExtensions = pick('includeExtensions', false);
            let withCredentials = false;
            if (typeof this.buoy.config.withCredentials !== 'undefined') {
                withCredentials = this.buoy.config.withCredentials;
            }

            // Add headers
            let headers;
            if (typeof this.buoy.config.headers !== 'undefined') {
                headers = this.buoy.config.headers();
            }

            // Run HeaderManipulator middleware
            this.buoy._middleware.forEach((middleware: any) => {
                if (isFunction(middleware.manipulateHeaders)) {
                    // TODO Check returned data - throw exception if invalid
                    headers = middleware.manipulateHeaders(headers, operation.query, operation.variables);
                }
            });

            const httpOptions = {
                headers: headers,
                withCredentials: withCredentials
            };

            // Send the POST request
            this.buoy.http.post(this.buoy.config.uri, this.payload(operation), httpOptions)
                .toPromise()
                .then(
                    (result: any) => {
                        // Run ResponseManipulator middleware
                        this.buoy._middleware.forEach((middleware: any) => {
                            if (isFunction(middleware.manipulateResponse)) {
                                // TODO Check returned data - throw exception if invalid
                                result = middleware.manipulateResponse(result, operation.query, operation.variables);
                            }
                        });

                        // Subscribe if subscription-channel is returned
                        let subscriptionChannel;
                        if (typeof this.buoy.config.subscriptions !== 'undefined') {
                            subscriptionChannel = this._getChannel(result, operation);
                        }

                        if (subscriptionChannel) {
                            this.buoy.config.subscriptions.createSubscription(subscriptionChannel, observer);
                        } else {
                            operation.setContext(result);
                            observer.next(result);
                            observer.complete();
                        }
                    },
                    (error) => {
                        // TODO Handle Http Error
                        observer.error(error); // TODO complete necessary?
                    }
                );
        });
    }

    public request(op: Operation): Observable<FetchResult> | null {
        // console.log('REQUEST!', op);
        return this.requester(op);
    }

    /**
     * Generate the HTTP Payload.
     */
    private payload(operation) {
        // Extract files from variables
        const files = extractFiles(operation.variables);

        // Define operations
        const operations = {
            operationName: operation.operationName,
            query: print(operation.query),
            variables: operation.variables,
            extensions: operation.extensions
        };

        if (files.files.size === 0) {
            return operations;
        }

        const payload = new FormData();

        // Generate map
        const map = {};
        let i = 0;
        console.log('PRE APPEND', + payload);
        for (const [file, path] of files.files.entries()) {
            map[i] = ['variables.' + path];
            payload.append(i.toString(), file, file.name);
            i++;
        }

        payload.append('operations', JSON.stringify(operations));
        payload.append('map', JSON.stringify(map));

        return payload;
    }

    private _getChannel(data, operation) {
        return !!data.extensions &&
        !!data.extensions.lighthouse_subscriptions &&
        !!data.extensions.lighthouse_subscriptions.channels
            ? data.extensions.lighthouse_subscriptions.channels[operation.operationName]
            : null;
    }
}
