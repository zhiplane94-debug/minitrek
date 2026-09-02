import { defineStore } from 'pinia';
import { api, type Trip } from '../api/client';

export const useTripsStore = defineStore('trips', {
  state: () => ({
    trips: [] as Trip[],
    loading: false,
    error: '' as string,
  }),
  actions: {
    async fetchTrips() {
      this.loading = true;
      this.error = '';
      try {
        this.trips = await api.listTrips();
      } catch (e) {
        this.error = (e as Error).message;
      } finally {
        this.loading = false;
      }
    },
    async createTrip(data: {
      title: string;
      origin: string;
      destination: string;
      startDate: string;
      endDate?: string;
    }) {
      const trip = await api.createTrip(data);
      this.trips.unshift(trip);
      return trip;
    },
    async deleteTrip(id: string) {
      await api.deleteTrip(id);
      this.trips = this.trips.filter((t) => t.id !== id);
    },
    async updateTrip(
      id: string,
      data: { title?: string; origin?: string; destination?: string; startDate?: string; endDate?: string },
    ) {
      const trip = await api.updateTrip(id, data);
      const i = this.trips.findIndex((t) => t.id === id);
      if (i >= 0) this.trips[i] = trip;
      else this.trips.unshift(trip);
      return trip;
    },
  },
});
