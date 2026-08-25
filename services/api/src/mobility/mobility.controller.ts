import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { MobilityService, type JourneyRequest } from "./mobility.service";

@Controller("mobility")
export class MobilityController {
  constructor(private readonly mobility: MobilityService) {}

  @Get("search")
  search(@Query("q") query: string) {
    return this.mobility.searchPlaces(query);
  }

  @Post("journeys")
  journeys(@Body() request: JourneyRequest) {
    return this.mobility.buildJourneys(request);
  }
}
