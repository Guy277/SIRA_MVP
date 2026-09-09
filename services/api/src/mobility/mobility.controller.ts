import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { MobilityService, type JourneyRequest, type MultimodalRequest } from "./mobility.service";

type Point = { lat: number; lon: number; name?: string };

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

  @Get("transport/stops/nearby")
  async getNearbyStops(
    @Query("lat") latitude: string,
    @Query("lon") longitude: string,
    @Query("radiusM") radiusM?: string,
  ) {
    return this.mobility.findNearbyStops(Number(latitude), Number(longitude), radiusM ? Number(radiusM) : undefined);
  }

  @Post("transport/walk")
  async walk(@Body() request: { origin: Point; destination: Point; maxDistanceM?: number; connectorKind?: "access" | "egress" | "transfer" }) {
    return this.mobility.walk(request.origin, request.destination, {
      maxDistanceM: request.maxDistanceM,
      connectorKind: request.connectorKind,
    });
  }

  @Post("transport/walk-access")
  async walkAccess(@Body() request: { origin: Point; radiusM?: number; maxWalkingDistanceM?: number; maxCandidates?: number }) {
    return this.mobility.findAccessibleStop(request.origin, {
      radiusM: request.radiusM,
      maxWalkingDistanceM: request.maxWalkingDistanceM,
      maxCandidates: request.maxCandidates,
    });
  }

  @Post("transport/walk-egress")
  async walkEgress(@Body() request: { fromStop: { lat: number; lon: number; id?: string; name?: string }; destination: Point; maxWalkingDistanceM?: number }) {
    return this.mobility.findEgressWalk(request.fromStop, request.destination, {
      maxWalkingDistanceM: request.maxWalkingDistanceM,
    });
  }

  @Post("transport/segment")
  async getTransportSegment(@Body() request: { origin: Point; destination: Point; radiusM?: number }) {
    return this.mobility.findTransportSegment(request);
  }

  @Post("transport/multimodal")
  async multimodal(@Body() request: MultimodalRequest) {
    return this.mobility.buildPostgisMultimodalJourney(request.origin, request.destination, {
      radiusM: request.radiusM,
      maxWalkingDistanceM: request.maxWalkingDistanceM,
      maxCandidates: request.maxCandidates,
    });
  }

  @Post("journeys")
  journeys(@Body() request: JourneyRequest) {
    return this.mobility.buildJourneys(request);
  }
}
