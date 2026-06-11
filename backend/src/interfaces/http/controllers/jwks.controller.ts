import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JsonWebKeySet, TokenService } from '../../../domain/auth/token.service';
import { JwksDto } from '../presenters/jwks.dto';

@ApiTags('Discovery')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokenService: TokenService) {}

  @Get('jwks.json')
  @ApiOperation({ summary: 'Get the JSON Web Key Set used to verify access tokens' })
  @ApiResponse({ status: 200, type: JwksDto })
  async jwks(): Promise<JsonWebKeySet> {
    return this.tokenService.getJwks();
  }
}
