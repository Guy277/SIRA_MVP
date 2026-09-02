import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { MobilityService, type JourneyRequest } from "./mobility.service";

@Controller("mobility")
export class MobilityController {
  constructor(private readonly mobility: MobilityService) {}

  @Get("search")
  search(@Query("q") query: string) {
    return this.mobility.searchPlaces(query);
  }

  @Get("transport/lines")
  async getTransportLines(
    @Query("operator") operator?: string,
    @Query("network") network?: string,
    @Query("siraMode") siraMode?: string,
    @Query("validationStatus") validationStatus?: string,
  ) {
    return this.mobility.getTransportLines({ operator, network, siraMode, validationStatus });
  }

  @Get("transport/lines/geojson")
  async getTransportGeoJson(
    @Query("bbox") bbox?: string,
    @Query("operator") operator?: string,
    @Query("network") network?: string,
    @Query("siraMode") siraMode?: string,
    @Query("validationStatus") validationStatus?: string,
  ) {
    return this.mobility.getTransportGeoJson({ bbox, operator, network, siraMode, validationStatus });
  }

  @Get("transport/lines/:id")
  async getTransportLine(@Param("id") id: string) {
    return this.mobility.getTransportLine(id);
  }

  @Get("transport/networks")
  async getTransportNetworks() {
    return this.mobility.getTransportNetworks();
  }

  @Get("transport/operators")
  async getTransportOperators() {
    return this.mobility.getTransportOperators();
  }

  @Post("journeys")
  journeys(@Body() request: JourneyRequest) {
    return this.mobility.buildJourneys(request);
  }
}
