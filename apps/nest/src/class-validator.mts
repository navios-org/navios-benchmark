/** The same input validated the traditional way: DTO classes and ValidationPipe. */
import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { OrdersService, PostsService, SearchService, UsersService } from './services.mjs'

class CreateUserDto {
  @IsString()
  @Length(1, 100)
  name!: string

  @IsEmail()
  email!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number
}

class SearchDto {
  @IsString()
  @Length(1, 100)
  q!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10

  @IsIn(['asc', 'desc'])
  sort: 'asc' | 'desc' = 'asc'
}

class PostsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10
}

class AddressDto {
  @IsString()
  @MinLength(1)
  street!: string

  @IsString()
  @MinLength(1)
  city!: string

  @Matches(/^\d{5}$/)
  zip!: string

  @IsString()
  @Length(2, 2)
  country!: string
}

class CustomerDto {
  @IsString()
  @MinLength(1)
  id!: string

  @IsEmail()
  email!: string

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto
}

class OrderItemDto {
  @IsString()
  @Length(1, 40)
  sku!: string

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number

  @IsNumber()
  @Min(0)
  unitPrice!: number

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  tags!: string[]
}

class OrderDto {
  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[]

  @IsOptional()
  @IsString()
  coupon?: string

  @IsBoolean()
  giftWrap: boolean = false
}

@Controller('users')
export class CreateUserController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.users.create(body)
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  search(@Query() query: SearchDto) {
    return this.service.search(query)
  }
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: OrderDto) {
    return this.orders.create(body)
  }
}

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(@Query() query: PostsDto) {
    return this.posts.list(query)
  }
}

export const controllers = [
  CreateUserController,
  SearchController,
  OrdersController,
  PostsController,
]
