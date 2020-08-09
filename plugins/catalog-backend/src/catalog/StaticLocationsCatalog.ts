/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Location, LocationSpec } from '@backstage/catalog-model';
import {
  LocationResponse,
  LocationsCatalog,
  LocationUpdateLogEvent,
} from './types';
import { DatabaseLocationUpdateLogStatus } from '../database/types';
import { ConflictError, NotFoundError } from '@backstage/backend-common';
import { Config } from '@backstage/config';

export class StaticLocationsCatalog implements LocationsCatalog {
  static readConfig(config: Config): LocationSpec[] {
    const staticLocations: LocationSpec[] = [];

    const lConfigs = config.getOptionalConfigArray('catalog.locations') ?? [];
    for (const lConfig of lConfigs) {
      const type = lConfig.getString('type');
      const target = lConfig.getString('target');
      staticLocations.push({ type, target });
    }

    return staticLocations;
  }

  private readonly staticLocations: LocationResponse[];

  constructor(
    staticLocations: LocationSpec[],
    private readonly innerCatalog?: LocationsCatalog,
  ) {
    this.staticLocations = staticLocations.map((s, index) => ({
      data: {
        id: `static-${index}`,
        ...s,
      },
      currentStatus: {
        message: null,
        status: null,
        timestamp: null,
      },
    }));
  }

  async addLocation(location: Location): Promise<Location> {
    const isStatic = this.staticLocations.some(
      s => location.type === s.data.type && location.target === s.data.target,
    );
    if (isStatic) {
      throw new ConflictError(
        `Conflicting static location for type=${location.type} target=${location.target}`,
      );
    }
    if (this.innerCatalog) {
      return this.innerCatalog.addLocation(location);
    }
    throw new ConflictError(
      'Only static location entries are supported by this catalog',
    );
  }

  async removeLocation(id: string): Promise<void> {
    return this.innerCatalog?.removeLocation(id);
  }

  async locations(): Promise<LocationResponse[]> {
    const items = (await this.innerCatalog?.locations()) ?? [];
    return [...this.staticLocations, ...items];
  }

  async locationHistory(id: string): Promise<LocationUpdateLogEvent[]> {
    return this.innerCatalog?.locationHistory(id) ?? [];
  }

  async location(id: string): Promise<LocationResponse> {
    const staticLocation = this.staticLocations.find(l => l.data.id === id);
    if (staticLocation) {
      return staticLocation;
    }
    const innerLocation = this.innerCatalog?.location(id);
    if (innerLocation) {
      return innerLocation;
    }
    throw new NotFoundError(`Found no location with ID ${id}`);
  }

  async logUpdateSuccess(
    locationId: string,
    entityName?: string,
  ): Promise<void> {
    const staticLocation = this.staticLocations.find(
      l => l.data.id === locationId,
    );
    if (staticLocation) {
      staticLocation.currentStatus.status =
        DatabaseLocationUpdateLogStatus.SUCCESS;
      staticLocation.currentStatus.message = null;
      staticLocation.currentStatus.timestamp = new Date().toISOString();
    } else {
      await this.innerCatalog?.logUpdateSuccess(locationId, entityName);
    }
  }

  async logUpdateFailure(
    locationId: string,
    error?: Error,
    entityName?: string,
  ): Promise<void> {
    const staticLocation = this.staticLocations.find(
      l => l.data.id === locationId,
    );
    if (staticLocation) {
      staticLocation.currentStatus.status =
        DatabaseLocationUpdateLogStatus.SUCCESS;
      staticLocation.currentStatus.message = null;
      staticLocation.currentStatus.timestamp = new Date().toISOString();
    } else {
      await this.innerCatalog?.logUpdateFailure(locationId, error, entityName);
    }
  }
}
